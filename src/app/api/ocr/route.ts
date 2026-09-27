// Lectura de una lista desde foto. La imagen se procesa en memoria y no se guarda.
// Requiere ANTHROPIC_API_KEY en el servidor; sin ella la función queda desactivada.

import { NextResponse } from 'next/server';
import { clientKey, RateLimiter } from '@/lib/api/rateLimit';
import { parseListText } from '@/lib/listParse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const limiter = new RateLimiter(6, 3);
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const PROMPT = `Esta imagen es una lista de mercado (escrita a mano, impresa o una captura de pantalla).
Transcribe cada producto en una línea, con este formato exacto:
<cantidad> <producto con marca y tamaño tal como aparece>
Si no aparece la cantidad, usa 1. No agregues productos que no estén en la imagen, no inventes marcas ni tamaños, y no escribas nada más.
Si la imagen no contiene una lista de mercado, responde solo: SIN_LISTA`;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'La lectura de fotos no está activada en este servidor.' }, { status: 503 });
  }
  if (!limiter.allow(clientKey(req.headers))) {
    return NextResponse.json({ error: 'Demasiadas fotos seguidas. Espera un minuto.' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const mediaType = typeof b.mediaType === 'string' ? b.mediaType : '';
  const data = typeof b.data === 'string' ? b.data : '';
  if (!TYPES.includes(mediaType) || !/^[A-Za-z0-9+/=]+$/.test(data)) {
    return NextResponse.json({ error: 'Formato de imagen no soportado. Usa JPG, PNG o WebP.' }, { status: 400 });
  }
  if ((data.length * 3) / 4 > MAX_BYTES) {
    return NextResponse.json({ error: 'La foto es muy pesada (máximo 5 MB).' }, { status: 413 });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'No se pudo leer la foto en este momento.' }, { status: 502 });
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('\n');
    if (text.includes('SIN_LISTA')) {
      return NextResponse.json({ items: [], message: 'No encontramos una lista de mercado en la foto.' });
    }
    return NextResponse.json({ items: parseListText(text).slice(0, 30) });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto en este momento.' }, { status: 502 });
  }
}
