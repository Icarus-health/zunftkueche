// Der Schlüssel zur KI liegt nie lesbar in SharePoint. Er wird im Browser mit einem Kennwort verschlüsselt
// (PBKDF2 mit SHA-256, danach AES-GCM) und nur als Geheimtext gespeichert.
// Wer den Eingang nutzt, gibt das Kennwort einmal je Gerät ein. Ohne Kennwort ist der Geheimtext wertlos.
import { toBase64 } from './provider.ts';

export interface Sealed {
  /** Geheimtext mit Prüfsumme, Base64. */
  cipher: string;
  /** Salz für die Ableitung, Base64. */
  salt: string;
  /** Startwert der Verschlüsselung, Base64. */
  iv: string;
  /** Runden der Ableitung. */
  rounds: number;
}
/** So viele Runden bremsen das Durchprobieren von Kennwörtern, ohne das Telefon spürbar warten zu lassen. */
export const ROUNDS = 600000;
export const MIN_PASSWORD = 10;

export class VaultError extends Error {}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const subtle = (): SubtleCrypto => {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new VaultError('Dieser Browser kann nicht verschlüsseln. Bitte einen aktuellen Browser nehmen.');
  return api;
};

/** Leitet aus Kennwort und Salz den Arbeitsschlüssel ab. Das ist der langsame Schritt. */
export async function deriveKey(password: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, material, 256);
  return new Uint8Array(bits);
}
const aes = (key: Uint8Array, usage: KeyUsage): Promise<CryptoKey> =>
  subtle().importKey('raw', key, 'AES-GCM', false, [usage]);

/** Verschlüsselt ein Geheimnis mit einem Kennwort. Gibt auch den Arbeitsschlüssel zurück, damit das Gerät freigeschaltet bleibt. */
export async function seal(
  secret: string,
  password: string,
  rounds = ROUNDS
): Promise<{ sealed: Sealed; key: Uint8Array }> {
  if (password.length < MIN_PASSWORD)
    throw new VaultError(
      'Das Kennwort braucht mindestens ' + MIN_PASSWORD + ' Zeichen. Gut sind drei oder vier Wörter.'
    );
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, rounds);
  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    await aes(key, 'encrypt'),
    new TextEncoder().encode(secret)
  );
  return {
    sealed: { cipher: toBase64(new Uint8Array(cipher)), salt: toBase64(salt), iv: toBase64(iv), rounds },
    key
  };
}

/** Entschlüsselt mit dem Arbeitsschlüssel. Wirft, wenn er nicht passt. */
export async function openWithKey(sealed: Sealed, key: Uint8Array): Promise<string> {
  try {
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      await aes(key, 'decrypt'),
      fromBase64(sealed.cipher)
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new VaultError('Das Kennwort stimmt nicht.');
  }
}

/** Entschlüsselt mit dem Kennwort. Gibt Geheimnis und Arbeitsschlüssel zurück. */
export async function openWithPassword(sealed: Sealed, password: string): Promise<{ secret: string; key: Uint8Array }> {
  const key = await deriveKey(password, fromBase64(sealed.salt), sealed.rounds);
  return { secret: await openWithKey(sealed, key), key };
}

export function validSealed(value: unknown): value is Sealed {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const b64 = (x: unknown, min: number, max: number): boolean =>
    typeof x === 'string' && x.length >= min && x.length <= max && /^[A-Za-z0-9+/]+=*$/.test(x);
  return (
    b64(v.cipher, 24, 2000) &&
    b64(v.salt, 20, 64) &&
    b64(v.iv, 16, 32) &&
    Number.isInteger(v.rounds) &&
    (v.rounds as number) >= 100000 &&
    (v.rounds as number) <= 5000000
  );
}
