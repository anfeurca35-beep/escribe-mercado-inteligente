import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, app: 'mercado-inteligente', version: '1.0.0-beta' });
}
