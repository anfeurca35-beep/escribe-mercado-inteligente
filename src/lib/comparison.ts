// Comparación centralizada. Funciones puras, sin red.
//
// Reglas:
// - Totales y recomendaciones usan SOLO ofertas EXACTAS con precio verificado
//   e incluidas en totales (ciudad y costos confirmados).
// - "Comprar todo en un solo lugar" solo aparece con 100 % de cobertura exacta.
// - Todas las sumas multiplican por la cantidad solicitada.

import type { ListItem, Offer, ProviderId, ProviderInfo } from './types';

export function isUsableExact(offer: Offer): boolean {
  return (
    offer.includedInTotals &&
    offer.status === 'OK' &&
    offer.match === 'EXACTO' &&
    offer.product !== null &&
    typeof offer.product.price === 'number' &&
    Number.isFinite(offer.product.price) &&
    offer.product.price > 0
  );
}

export interface ProviderCoverage {
  providerId: ProviderId;
  name: string;
  integration: ProviderInfo['integration'];
  requested: number;
  /** Productos localizados (exacto, probable o equivalente), con o sin precio. */
  found: number;
  exact: number;
  probable: number;
  equivalent: number;
  noPrice: number;
  notFound: number;
  unavailable: number;
  pending: number;
  /** Exactos con precio que no entran en totales (ciudad o costos sin confirmar). */
  excluded: number;
  /** Suma de precio × cantidad de los exactos utilizables. */
  exactSubtotal: number;
  coveragePct: number;
  /** Aún no hay respuesta de este proveedor. */
  waiting: boolean;
}

export interface PlanLine {
  itemId: string;
  itemName: string;
  quantity: number;
  providerId: ProviderId;
  providerName: string;
  productName: string;
  unitPrice: number;
  listPrice: number | null;
  lineTotal: number;
  url: string | null;
}

export interface SavingsComparison {
  providerId: ProviderId;
  name: string;
  itemsCompared: number;
  coversWholePlan: boolean;
  providerCost: number;
  planCost: number;
  savings: number;
}

export interface MaxSavingsPlan {
  lines: PlanLine[];
  byProvider: Array<{ providerId: ProviderId; name: string; lines: PlanLine[]; subtotal: number }>;
  total: number;
  itemsCovered: number;
  missing: ListItem[];
  comparisons: SavingsComparison[];
}

export interface SingleStoreOption {
  providerId: ProviderId;
  name: string;
  total: number;
}

export interface ComparisonResult {
  requested: number;
  coverage: ProviderCoverage[];
  /** Opciones con 100 % de cobertura exacta, de menor a mayor total. */
  singleStoreOptions: SingleStoreOption[];
  bestCoverage: ProviderCoverage | null;
  maxSavings: MaxSavingsPlan;
  /** Ofertas con precio que se muestran aparte y no entran en totales. */
  excludedOffers: Offer[];
}

export function compareList(
  items: ListItem[],
  offers: Offer[],
  providers: ProviderInfo[],
  answeredProviders?: Set<ProviderId>,
): ComparisonResult {
  const requested = items.length;
  const itemIds = new Set(items.map((i) => i.id));
  const relevant = offers.filter((o) => itemIds.has(o.itemId));
  const qtyOf = new Map(items.map((i) => [i.id, i.quantity]));

  const coverage: ProviderCoverage[] = providers.map((p) => {
    const own = relevant.filter((o) => o.providerId === p.id);
    const c: ProviderCoverage = {
      providerId: p.id,
      name: p.name,
      integration: p.integration,
      requested,
      found: 0,
      exact: 0,
      probable: 0,
      equivalent: 0,
      noPrice: 0,
      notFound: 0,
      unavailable: 0,
      pending: 0,
      excluded: 0,
      exactSubtotal: 0,
      coveragePct: 0,
      waiting: answeredProviders ? !answeredProviders.has(p.id) && p.integration !== 'pendiente' : false,
    };
    for (const o of own) {
      switch (o.status) {
        case 'PENDIENTE_INTEGRACION':
          c.pending++;
          continue;
        case 'PROVEEDOR_NO_DISPONIBLE':
          c.unavailable++;
          continue;
        case 'NO_ENCONTRADO':
          c.notFound++;
          continue;
        case 'SIN_PRECIO':
          c.found++;
          c.noPrice++;
          continue;
        case 'OK':
          c.found++;
          if (o.match === 'EXACTO') {
            if (isUsableExact(o)) {
              c.exact++;
              c.exactSubtotal += (o.product?.price ?? 0) * (qtyOf.get(o.itemId) ?? 1);
            } else {
              c.excluded++;
            }
          } else if (o.match === 'PROBABLE') c.probable++;
          else if (o.match === 'EQUIVALENTE') c.equivalent++;
          else c.notFound++;
      }
    }
    c.coveragePct = requested > 0 ? Math.round((c.exact / requested) * 1000) / 10 : 0;
    return c;
  });

  const singleStoreOptions: SingleStoreOption[] = coverage
    .filter((c) => requested > 0 && c.exact === requested)
    .map((c) => ({ providerId: c.providerId, name: c.name, total: c.exactSubtotal }))
    .sort((a, b) => a.total - b.total);

  const withExact = coverage.filter((c) => c.exact > 0);
  const bestCoverage =
    withExact.length === 0
      ? null
      : [...withExact].sort((a, b) => b.exact - a.exact || a.exactSubtotal - b.exactSubtotal)[0];

  const maxSavings = buildMaxSavings(items, relevant, providers);

  const excludedOffers = relevant.filter(
    (o) => !o.includedInTotals && o.match === 'EXACTO' && o.product !== null && o.product.price !== null && o.status === 'OK',
  );

  return { requested, coverage, singleStoreOptions, bestCoverage, maxSavings, excludedOffers };
}

function buildMaxSavings(items: ListItem[], offers: Offer[], providers: ProviderInfo[]): MaxSavingsPlan {
  const nameOf = new Map(providers.map((p) => [p.id, p.name]));
  const lines: PlanLine[] = [];
  const missing: ListItem[] = [];

  for (const item of items) {
    const candidates = offers.filter((o) => o.itemId === item.id && isUsableExact(o));
    if (candidates.length === 0) {
      missing.push(item);
      continue;
    }
    candidates.sort((a, b) => (a.product?.price ?? Infinity) - (b.product?.price ?? Infinity));
    const best = candidates[0];
    const unitPrice = best.product?.price ?? 0;
    lines.push({
      itemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      providerId: best.providerId,
      providerName: nameOf.get(best.providerId) ?? best.providerId,
      productName: best.product?.name ?? item.name,
      unitPrice,
      listPrice: best.product?.listPrice ?? null,
      lineTotal: unitPrice * item.quantity,
      url: best.product?.url ?? null,
    });
  }

  const groups = new Map<ProviderId, PlanLine[]>();
  for (const line of lines) {
    const list = groups.get(line.providerId) ?? [];
    list.push(line);
    groups.set(line.providerId, list);
  }
  const byProvider = [...groups.entries()]
    .map(([providerId, ls]) => ({
      providerId,
      name: nameOf.get(providerId) ?? providerId,
      lines: ls,
      subtotal: ls.reduce((s, l) => s + l.lineTotal, 0),
    }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  // Comparación contra alternativas comparables: para cada proveedor, los
  // productos del plan que ese proveedor también tiene como EXACTO.
  const comparisons: SavingsComparison[] = [];
  for (const p of providers) {
    let providerCost = 0;
    let planCost = 0;
    let n = 0;
    for (const line of lines) {
      const o = offers.find((x) => x.itemId === line.itemId && x.providerId === p.id && isUsableExact(x));
      if (!o || o.product?.price == null) continue;
      providerCost += o.product.price * line.quantity;
      planCost += line.lineTotal;
      n++;
    }
    if (n === 0) continue;
    comparisons.push({
      providerId: p.id,
      name: p.name,
      itemsCompared: n,
      coversWholePlan: n === lines.length,
      providerCost,
      planCost,
      savings: providerCost - planCost,
    });
  }
  comparisons.sort(
    (a, b) => Number(b.coversWholePlan) - Number(a.coversWholePlan) || b.itemsCompared - a.itemsCompared || b.savings - a.savings,
  );

  return { lines, byProvider, total, itemsCovered: lines.length, missing, comparisons };
}
