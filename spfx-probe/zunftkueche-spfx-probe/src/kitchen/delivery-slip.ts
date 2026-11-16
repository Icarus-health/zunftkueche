export type SlipExtension = 'pdf' | 'jpg' | 'png';

export interface SlipFile {
  name: string;
  bytes: Uint8Array;
}

export const slipFileLimit = 8 * 1024 * 1024;

export function slipExtension(bytes: Uint8Array): SlipExtension {
  if (bytes.length > slipFileLimit) throw new Error('Der Lieferschein darf höchstens 8 MB groß sein.');
  const startsWith = (signature: number[]): boolean => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([37, 80, 68, 70, 45])) return 'pdf';
  if (startsWith([255, 216, 255])) return 'jpg';
  if (startsWith([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
  throw new Error('Bitte einen Lieferschein als PDF, JPEG oder PNG auswählen.');
}

export function slipFileName(name: string, extension: SlipExtension): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '-')
    .trim()
    .slice(0, 145);
  return (base || 'Lieferschein') + '.' + extension;
}
