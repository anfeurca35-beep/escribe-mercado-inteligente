import { NextResponse } from 'next/server';
import { buildRegistry, configFromEnv, PROVIDER_ORDER } from '@/lib/providers/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const registry = buildRegistry(configFromEnv(process.env));
  const providers = PROVIDER_ORDER.map((id) => registry.get(id)!.info);
  return NextResponse.json({
    providers,
    features: { photoImport: Boolean(process.env.ANTHROPIC_API_KEY) },
    version: process.env.RENDER_GIT_COMMIT || 'dev',
  });
}
