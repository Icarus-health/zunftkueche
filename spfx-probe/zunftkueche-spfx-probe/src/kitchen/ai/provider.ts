// Anbindung an ein Sprachmodell, direkt aus dem Browser. Zwei Wege: Claude (Anthropic) und OpenRouter.
// Dieser Baustein kennt keine Küchendaten. Er schickt Text und Dateien samt Schema und gibt geprüftes JSON zurück.
// Das Modell schreibt nie selbst in die App: wer hier aufruft, bekommt nur einen Vorschlag.

export type Provider = 'anthropic' | 'openrouter' | 'openrouter-eu';

export interface AiFile {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}
export interface AiRequest {
  provider: Provider;
  key: string;
  model: string;
  /** Rolle und feste Regeln. */
  system: string;
  /** Der eigentliche Auftrag. */
  text: string;
  files?: AiFile[];
  /** JSON-Schema der Antwort. Jedes Objekt braucht `additionalProperties: false` und alle Felder in `required`. */
  schema: object;
  schemaName: string;
  maxTokens?: number;
}
export interface AiResult {
  json: unknown;
  /** Grund für das Ende der Antwort, wie der Anbieter ihn nennt. */
  stop: string;
  usage: { input: number; output: number };
  ms: number;
  model: string;
}
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Fehler mit einer Meldung, die man der Person am Gerät zeigen kann. `detail` trägt die Rohantwort für die Fehlersuche. */
export class AiError extends Error {
  public constructor(
    message: string,
    public readonly kind: 'key' | 'credit' | 'busy' | 'size' | 'network' | 'request' | 'answer',
    public readonly detail = ''
  ) {
    super(message);
  }
}

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-5-5',
  openrouter: 'anthropic/claude-haiku-5.5',
  'openrouter-eu': 'anthropic/claude-haiku-5.5'
};
export const PROVIDER_NAME: Record<Provider, string> = {
  anthropic: 'Claude direkt (Anthropic)',
  openrouter: 'OpenRouter',
  // Die Europa-Adresse nimmt OpenRouter nur im Business-Tarif an (Stand November 2026).
  'openrouter-eu': 'OpenRouter Europa (nur Business-Tarif)'
};
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2026-10-21';
const openRouterBase = (provider: Provider): string =>
  provider === 'openrouter-eu' ? 'https://eu.openrouter.ai/api/v1' : 'https://openrouter.ai/api/v1';

/** Base64 ohne Zwischenkopie der ganzen Datei als Zeichenkette je Byte. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
}
const isImage = (type: string): boolean => /^image\/(jpeg|png|webp|gif)$/.test(type);

/** Baut die Anfrage. Getrennt vom Senden, damit Tests sie ohne Netz prüfen können. */
export function buildRequest(request: AiRequest): { url: string; init: RequestInit } {
  const files = request.files || [];
  for (const file of files)
    if (file.mediaType !== 'application/pdf' && !isImage(file.mediaType))
      throw new AiError('Nur PDF und Bilder (JPEG, PNG, WebP) lassen sich lesen.', 'request', file.mediaType);
  // Großzügig: eine lange Getränkerechnung hat über hundert Zeilen, und das Nachdenken des Modells zählt mit.
  const maxTokens = request.maxTokens || 32000;
  if (request.provider === 'anthropic') {
    const content: object[] = files.map(file =>
      file.mediaType === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: toBase64(file.bytes) }
          }
        : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: toBase64(file.bytes) } }
    );
    content.push({ type: 'text', text: request.text });
    return {
      url: ANTHROPIC,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': ANTHROPIC_VERSION,
          'x-api-key': request.key,
          // Ohne diese Kopfzeile lässt Anthropic keine Aufrufe aus dem Browser zu.
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: maxTokens,
          system: request.system,
          messages: [{ role: 'user', content }],
          output_config: { format: { type: 'json_schema', schema: request.schema } }
        })
      }
    };
  }
  const parts: object[] = [{ type: 'text', text: request.text }];
  for (const file of files) {
    const url = 'data:' + file.mediaType + ';base64,' + toBase64(file.bytes);
    parts.push(
      file.mediaType === 'application/pdf'
        ? { type: 'file', file: { filename: file.name || 'beleg.pdf', file_data: url } }
        : { type: 'image_url', image_url: { url } }
    );
  }
  return {
    url: openRouterBase(request.provider) + '/chat/completions',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + request.key,
        'x-openrouter-title': 'Zunftkueche'
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: parts }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: request.schemaName, strict: true, schema: request.schema }
        },
        // Nur Anbieter, die das Schema wirklich einhalten.
        provider: { require_parameters: true }
      })
    }
  };
}

function failure(status: number, body: string): AiError {
  let message = '';
  try {
    const data = JSON.parse(body) as { error?: { message?: string } | string };
    message = typeof data.error === 'string' ? data.error : data.error?.message || '';
  } catch {
    /* Antwort ist kein JSON: die Statusnummer muss reichen. */
  }
  const detail = status + (message ? ' · ' + message : '');
  if (status === 401 || status === 403)
    return new AiError('Der Schlüssel wird nicht angenommen. Bitte prüfen oder neu anlegen.', 'key', detail);
  if (status === 402 || /credit|balance|billing|quota/i.test(message))
    return new AiError('Das Guthaben beim Anbieter ist aufgebraucht.', 'credit', detail);
  if (status === 429 || status === 529 || status === 503)
    return new AiError('Der Anbieter ist gerade überlastet. Bitte in einer Minute noch einmal.', 'busy', detail);
  if (status === 413) return new AiError('Die Datei ist für den Anbieter zu groß.', 'size', detail);
  return new AiError('Der Anbieter hat die Anfrage abgelehnt.', 'request', detail);
}

/** Liest die Antwort des Anbieters. Wirft, wenn sie kein vollständiges JSON enthält. */
export function parseResponse(provider: Provider, status: number, body: string, ms = 0): AiResult {
  if (status < 200 || status >= 300) throw failure(status, body);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new AiError('Die Antwort des Anbieters ist unvollständig angekommen.', 'answer', body.slice(0, 300));
  }
  let text = '',
    stop = '',
    model = '',
    input = 0,
    output = 0;
  if (provider === 'anthropic') {
    const blocks = (data.content as Array<{ type?: string; text?: string }>) || [];
    text = blocks.find(block => block.type === 'text')?.text || '';
    stop = String(data.stop_reason || '');
    model = String(data.model || '');
    const usage = (data.usage || {}) as { input_tokens?: number; output_tokens?: number };
    input = usage.input_tokens || 0;
    output = usage.output_tokens || 0;
  } else {
    if (data.error) throw failure(Number((data.error as { code?: number }).code) || 400, body);
    const choice = ((data.choices as Array<Record<string, unknown>>) || [])[0] || {};
    const content = (choice.message as { content?: unknown } | undefined)?.content;
    text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(part => (part as { text?: string }).text || '').join('')
          : '';
    stop = String(choice.finish_reason || '');
    model = String(data.model || '');
    const usage = (data.usage || {}) as { prompt_tokens?: number; completion_tokens?: number };
    input = usage.prompt_tokens || 0;
    output = usage.completion_tokens || 0;
  }
  if (stop === 'max_tokens' || stop === 'length')
    throw new AiError('Die Antwort wurde abgeschnitten, der Beleg ist zu lang für einen Durchgang.', 'answer', stop);
  if (stop === 'refusal' || stop === 'content_filter')
    throw new AiError('Das Modell hat die Anfrage nicht bearbeitet.', 'answer', stop);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError('Das Modell hat nicht im verlangten Format geantwortet.', 'answer', text.slice(0, 300));
  }
  return { json, stop, usage: { input, output }, ms, model };
}

/** Fragt das Modell und gibt das JSON der Antwort zurück. */
export async function callModel(request: AiRequest, fetcher: Fetcher = fetch): Promise<AiResult> {
  if (!request.key.trim()) throw new AiError('Es ist kein Schlüssel hinterlegt.', 'key');
  const { url, init } = buildRequest(request);
  const started = Date.now();
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    throw new AiError(
      'Keine Verbindung zum Anbieter. Netz prüfen. In Teams oder im Firmennetz kann der Aufruf gesperrt sein.',
      'network',
      error instanceof Error ? error.message : String(error)
    );
  }
  return parseResponse(request.provider, response.status, await response.text(), Date.now() - started);
}
