import { NextResponse } from 'next/server';
import { handlePricesRequest } from '@/lib/api/prices';
import { clientKey, RateLimiter } from '@/lib/api/rateLimit';
import { buildRegistry, configFromEnv } from '@/lib/providers/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const registry = buildRegistry(configFromEnv(process.env));
// Cada comparación hace una petición por proveedor (4 activos).
const limiter = new RateLimiter(40, 20);

export async function POST(req: Request) {
  if (!limiter.allow(clientKey(req.headers))) {
    return NextResponse.json({ error: 'Demasiadas consultas seguidas. Espera un minuto e intenta de nuevo.' }, { status: 429 });
  }
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > 20_000) {
    return NextResponse.json({ error: 'La lista es demasiado grande.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const result = await handlePricesRequest(body, registry);
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
