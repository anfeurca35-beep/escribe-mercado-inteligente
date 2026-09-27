// Consulta los productos de una lista en un proveedor y construye ofertas.
// Solo se consultan los productos de la lista (sin rastrear catálogos).

import { cityName } from '../location';
import { classify, MATCH_RANK, parseQuery, searchTermFor } from '../matching';
import type { CityId, ListItem, MatchStatus, Offer, OfferStatus, ProviderProduct } from '../types';
import type { SearchOutcome, SupermarketProvider } from './base';

const ITEM_CONCURRENCY = 3;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function baseOffer(item: ListItem, provider: SupermarketProvider, fetchedAt: string): Offer {
  return {
    itemId: item.id,
    providerId: provider.info.id,
    status: 'NO_ENCONTRADO',
    match: 'NO_ENCONTRADO',
    matchReasons: [],
    product: null,
    equivalents: [],
    locationConfirmed: false,
    includedInTotals: false,
    exclusionReason: null,
    note: null,
    fetchedAt,
  };
}

function hasUsablePrice(p: ProviderProduct): boolean {
  return p.price !== null && p.price > 0 && p.available !== false;
}

export async function lookupList(
  provider: SupermarketProvider,
  items: ListItem[],
  city: CityId,
  now: () => Date = () => new Date(),
): Promise<Offer[]> {
  const info = provider.info;
  const fetchedAt = now().toISOString();

  if (info.integration === 'pendiente') {
    return items.map((item) => ({
      ...baseOffer(item, provider, fetchedAt),
      status: 'PENDIENTE_INTEGRACION' as OfferStatus,
      note: info.pendingReason ?? 'Pendiente de integración.',
    }));
  }

  if (info.cities !== 'todas' && !info.cities.includes(city)) {
    return items.map((item) => ({
      ...baseOffer(item, provider, fetchedAt),
      status: 'PROVEEDOR_NO_DISPONIBLE' as OfferStatus,
      note: `${info.name} no opera en ${cityName(city)}.`,
    }));
  }

  // Un mismo término de búsqueda se consulta una sola vez.
  const searches = new Map<string, Promise<SearchOutcome>>();
  const searchOnce = (term: string) => {
    let p = searches.get(term);
    if (!p) {
      p = provider.search(term, { city }).catch(
        (): SearchOutcome => ({ kind: 'unavailable', reason: 'Error inesperado al consultar el proveedor.' }),
      );
      searches.set(term, p);
    }
    return p;
  };

  return mapLimit(items, ITEM_CONCURRENCY, async (item) => {
    const offer = baseOffer(item, provider, fetchedAt);
    const query = parseQuery(item.name);
    const outcome = await searchOnce(searchTermFor(query));

    if (outcome.kind === 'unavailable') {
      return { ...offer, status: 'PROVEEDOR_NO_DISPONIBLE' as OfferStatus, note: outcome.reason };
    }

    const ranked = outcome.products
      .map((product) => ({ product, match: classify(query, product) }))
      .filter((r) => r.match.status !== 'NO_ENCONTRADO')
      .sort(
        (a, b) =>
          MATCH_RANK[a.match.status] - MATCH_RANK[b.match.status] ||
          Number(hasUsablePrice(b.product)) - Number(hasUsablePrice(a.product)) ||
          (a.product.price ?? Infinity) - (b.product.price ?? Infinity),
      );

    offer.locationConfirmed = outcome.confirmedCity === city;

    if (ranked.length === 0) {
      return { ...offer, status: 'NO_ENCONTRADO' as OfferStatus, match: 'NO_ENCONTRADO' as MatchStatus, note: 'El proveedor respondió, pero no hubo una coincidencia confiable.' };
    }

    let rep = ranked[0];
    // Completar precio desde la página del producto si hace falta.
    if (rep.product.price === null && provider.enrich) {
      rep = { ...rep, product: await provider.enrich(rep.product) };
    }

    offer.product = rep.product;
    offer.match = rep.match.status;
    offer.matchReasons = rep.match.reasons;
    offer.equivalents = ranked
      .filter((r) => r.match.status === 'EQUIVALENTE' && r.product !== ranked[0].product)
      .slice(0, 3)
      .map((r) => r.product);

    if (!hasUsablePrice(rep.product)) {
      offer.status = 'SIN_PRECIO';
      offer.note = rep.product.available === false ? 'Agotado en el proveedor.' : 'Producto localizado, pero sin precio utilizable.';
      return offer;
    }

    offer.status = 'OK';
    if (offer.match === 'EXACTO') {
      const reasons: string[] = [];
      if (info.marketplace) {
        reasons.push(
          `${info.name} es un marketplace: el precio depende de la tienda y no se conocen domicilio ni cargos de servicio.`,
        );
      }
      if (!offer.locationConfirmed) {
        reasons.push(`No se pudo confirmar que este precio sea de ${cityName(city)}.`);
      }
      offer.includedInTotals = reasons.length === 0;
      offer.exclusionReason = reasons.length > 0 ? reasons.join(' ') : null;
    }
    return offer;
  });
}
