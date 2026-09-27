// Manejador de /api/prices independiente del framework (testeable).

import { lookupList } from '../providers/lookup';
import type { SupermarketProvider } from '../providers/base';
import type { ProviderId, ProviderPricesResponse } from '../types';
import { validatePricesRequest } from '../validation';

export interface HandlerResult {
  status: number;
  body: unknown;
}

export async function handlePricesRequest(
  body: unknown,
  registry: Map<ProviderId, SupermarketProvider>,
): Promise<HandlerResult> {
  const v = validatePricesRequest(body);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const provider = registry.get(v.value.providerId);
  if (!provider) return { status: 400, body: { error: 'Proveedor inválido.' } };
  try {
    const offers = await lookupList(provider, v.value.items, v.value.city);
    const response: ProviderPricesResponse = {
      providerId: v.value.providerId,
      city: v.value.city,
      offers,
      fetchedAt: new Date().toISOString(),
    };
    return { status: 200, body: response };
  } catch {
    // No se filtran detalles internos.
    return { status: 500, body: { error: 'No se pudo completar la consulta.' } };
  }
}
