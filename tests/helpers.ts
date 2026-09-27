import type { ListItem, Offer, ProviderId, ProviderProduct } from '../src/lib/types';
import { PROVIDER_INFO, PROVIDER_ORDER } from '../src/lib/providers/registry';

export const providers = PROVIDER_ORDER.map((id) => PROVIDER_INFO[id]);

export function item(id: string, name: string, quantity = 1): ListItem {
  return { id, name, quantity };
}

export function product(name: string, price: number | null, extra: Partial<ProviderProduct> = {}): ProviderProduct {
  return { externalId: null, name, brand: null, price, listPrice: null, available: true, url: null, seller: null, ...extra };
}

export function exact(itemId: string, providerId: ProviderId, price: number, extra: Partial<Offer> = {}): Offer {
  return {
    itemId,
    providerId,
    status: 'OK',
    match: 'EXACTO',
    matchReasons: [],
    product: product(`producto ${itemId}`, price),
    equivalents: [],
    locationConfirmed: true,
    includedInTotals: true,
    exclusionReason: null,
    note: null,
    fetchedAt: '2026-09-24T12:00:00.000Z',
    ...extra,
  };
}

export function offerWith(itemId: string, providerId: ProviderId, patch: Partial<Offer>): Offer {
  return { ...exact(itemId, providerId, 1000), ...patch };
}
