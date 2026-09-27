// Consulta los productos de una lista en un proveedor y construye ofertas.
// Solo se consultan los productos de la lista (sin rastrear catálogos).
//
// Cada oferta trae VARIOS candidatos. El sistema solo decide solo cuando hay
// un único EXACTO con precio; si hay duda, marca la oferta como "pendiente"
// para que el usuario confirme. Las reglas de EXACTO no se relajan.

import { cityName } from '../location';
import { classify, MATCH_RANK, parseQuery, searchTermFor, type ParsedQuery } from '../matching';
import { normalizeText } from '../units';
import type { Candidate, CityId, ListItem, Offer, OfferStatus, ProviderProduct } from '../types';
import type { SearchOutcome, SupermarketProvider } from './base';

const ITEM_CONCURRENCY = 3;
export const MAX_CANDIDATES = 5;

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

/** Identificador estable de un producto dentro de un proveedor. */
export function productKey(p: Pick<ProviderProduct, 'externalId' | 'url' | 'name'>): string {
  return (p.externalId ?? p.url ?? p.name).slice(0, 300);
}

export function hasUsablePrice(p: ProviderProduct): boolean {
  return p.price !== null && p.price > 0 && p.available !== false;
}

function baseOffer(item: ListItem, provider: SupermarketProvider, fetchedAt: string): Offer {
  return {
    itemId: item.id,
    providerId: provider.info.id,
    status: 'NO_ENCONTRADO',
    match: 'NO_ENCONTRADO',
    matchReasons: [],
    product: null,
    candidates: [],
    equivalents: [],
    others: [],
    selection: 'no_aplica',
    eligible: false,
    locationConfirmed: false,
    includedInTotals: false,
    exclusionReason: null,
    note: null,
    fetchedAt,
  };
}

function rank(a: Candidate, b: Candidate): number {
  return (
    MATCH_RANK[a.match] - MATCH_RANK[b.match] ||
    Number(hasUsablePrice(b.product)) - Number(hasUsablePrice(a.product)) ||
    (a.product.price ?? Infinity) - (b.product.price ?? Infinity)
  );
}

/** Descartado por el algoritmo, pero comparte marca o alguna característica pedida. */
function isRelated(query: ParsedQuery, p: ProviderProduct): boolean {
  const text = ` ${normalizeText(`${p.name} ${p.brand ?? ''}`)} `;
  if (query.brand && text.replace(/\s/g, '').includes(query.brand.replace(/\s/g, ''))) return true;
  // Comparte alguna palabra con significado de lo pedido (tipo, sabor, variante).
  return query.descriptors.some((d) => d.length >= 4 && text.includes(` ${d}`));
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

/**
 * Convierte los productos del proveedor en una oferta con candidatos.
 * Función pura: `eligible` indica si el proveedor puede entrar en totales.
 */
export function buildOffer(
  base: Offer,
  query: ParsedQuery,
  products: ProviderProduct[],
  eligible: boolean,
  exclusionReason: string | null,
  pin?: string,
): Offer {
  const offer: Offer = { ...base, eligible, exclusionReason: eligible ? null : exclusionReason };
  const classified = dedupe(
    products.map((product) => {
      const m = classify(query, product);
      return { key: productKey(product), product, match: m.status, reasons: m.reasons };
    }),
  ).sort(rank);

  offer.candidates = classified.filter((c) => c.match === 'EXACTO' || c.match === 'PROBABLE').slice(0, MAX_CANDIDATES);
  offer.equivalents = classified.filter((c) => c.match === 'EQUIVALENTE').slice(0, MAX_CANDIDATES);
  offer.others = classified
    .filter((c) => c.match === 'NO_ENCONTRADO' && isRelated(query, c.product))
    .slice(0, MAX_CANDIDATES);

  // El producto elegido por el usuario siempre se conserva entre las opciones.
  const pinned = pin ? classified.find((c) => c.key === pin) : undefined;
  if (pinned && !offer.candidates.includes(pinned) && !offer.others.includes(pinned)) {
    if (pinned.match === 'EXACTO' || pinned.match === 'PROBABLE') offer.candidates.push(pinned);
    else offer.others.push(pinned);
  }

  const best = offer.candidates[0] ?? offer.equivalents[0];
  if (!best) {
    offer.status = 'NO_ENCONTRADO';
    offer.note =
      offer.others.length > 0
        ? 'No hubo una coincidencia confiable, pero hay otras opciones para revisar.'
        : 'No encontramos este producto.';
    return offer;
  }

  offer.product = best.product;
  offer.match = best.match;
  offer.matchReasons = best.reasons;
  offer.status = hasUsablePrice(best.product) ? 'OK' : 'SIN_PRECIO';
  if (offer.status === 'SIN_PRECIO') {
    offer.note = best.product.available === false ? 'Agotado en el proveedor.' : 'Producto localizado, pero sin precio utilizable.';
  }

  if (offer.candidates.length === 0) {
    // Solo equivalentes: se muestran como alternativas, nunca se eligen solos.
    offer.selection = 'no_aplica';
    return offer;
  }

  const usableExacts = offer.candidates.filter((c) => c.match === 'EXACTO' && hasUsablePrice(c.product));
  if (best.match === 'EXACTO' && usableExacts.length === 1) {
    offer.selection = 'auto';
    offer.includedInTotals = eligible;
  } else {
    offer.selection = 'pendiente';
    offer.matchReasons = [
      usableExacts.length > 1
        ? `Hay ${usableExacts.length} productos que coinciden; confirma cuál es el tuyo.`
        : 'No es seguro que sea el mismo producto; confírmalo.',
      ...best.reasons,
    ];
  }
  return offer;
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
    const base = baseOffer(item, provider, fetchedAt);
    const query = parseQuery(item.match ?? item.name);
    // Con una búsqueda refinada se consulta también lo que escribió el usuario:
    // un término más largo puede traer menos resultados en algunos sitios.
    // Todos los resultados se comparan contra la búsqueda refinada.
    const terms = [...new Set([searchTermFor(query), searchTermFor(parseQuery(item.name))])];
    const outcomes = await Promise.all(terms.map(searchOnce));
    const ok = outcomes.filter((o): o is Extract<SearchOutcome, { kind: 'ok' }> => o.kind === 'ok');
    if (ok.length === 0) {
      const failed = outcomes[0] as Extract<SearchOutcome, { kind: 'unavailable' }>;
      return { ...base, status: 'PROVEEDOR_NO_DISPONIBLE' as OfferStatus, note: failed.reason };
    }
    const outcome = {
      products: ok.flatMap((o) => o.products),
      // La ciudad solo se da por confirmada si todas las respuestas la confirman.
      confirmedCity: ok.every((o) => o.confirmedCity === city) ? city : null,
    };

    const locationConfirmed = outcome.confirmedCity === city;
    const reasons: string[] = [];
    if (info.marketplace) {
      reasons.push(`${info.name} es un marketplace: el precio depende de la tienda y no se conocen domicilio ni cargos de servicio.`);
    }
    if (!locationConfirmed) reasons.push(`No se pudo confirmar que este precio sea de ${cityName(city)}.`);
    const eligible = reasons.length === 0;

    let products = outcome.products;
    // Si el usuario eligió un producto que la búsqueda ya no devuelve, se trae por su código.
    if (item.pin && provider.fetchByKey && !products.some((p) => productKey(p) === item.pin)) {
      const pinned = await provider.fetchByKey(item.pin).catch(() => null);
      if (pinned) products = [pinned, ...products];
    }

    const offer = buildOffer({ ...base, locationConfirmed }, query, products, eligible, reasons.join(' ') || null, item.pin);

    // Completar precio desde la página del producto si hace falta (solo el mejor candidato).
    if (offer.product && offer.product.price === null && provider.enrich) {
      const enriched = await provider.enrich(offer.product);
      if (enriched.price !== null) {
        const key = productKey(offer.product);
        const withPrice = products.map((p) => (productKey(p) === key ? enriched : p));
        return buildOffer({ ...base, locationConfirmed }, query, withPrice, eligible, reasons.join(' ') || null, item.pin);
      }
    }
    return offer;
  });
}
