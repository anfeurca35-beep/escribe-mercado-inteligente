import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareList } from '../src/lib/comparison';
import { exact, item, offerWith, providers } from './helpers';

const lista = [item('arroz', 'Arroz Diana 1000 g', 2), item('leche', 'Leche entera Alquería 1 L', 3), item('cafe', 'Café Sello Rojo 250 g', 1)];

test('cantidades: el subtotal multiplica precio × cantidad', () => {
  const r = compareList(lista, [exact('arroz', 'euro', 4000), exact('leche', 'euro', 4200), exact('cafe', 'euro', 10000)], providers);
  const euro = r.coverage.find((c) => c.providerId === 'euro')!;
  assert.equal(euro.exactSubtotal, 4000 * 2 + 4200 * 3 + 10000);
});

test('recomendación: "comprar todo en un lugar" solo con 100 % de cobertura', () => {
  const parcial = compareList(lista, [exact('arroz', 'euro', 4000), exact('leche', 'euro', 4200)], providers);
  assert.equal(parcial.singleStoreOptions.length, 0, 'Euro tiene 2/3, no puede recomendarse como compra única');
  const completo = compareList(
    lista,
    [exact('arroz', 'euro', 4000), exact('leche', 'euro', 4200), exact('cafe', 'euro', 10000), exact('arroz', 'exito', 3900), exact('leche', 'exito', 4100), exact('cafe', 'exito', 12000)],
    providers,
  );
  assert.deepEqual(completo.singleStoreOptions.map((s) => s.providerId), ['euro', 'exito']);
  assert.equal(completo.singleStoreOptions[0].total, 4000 * 2 + 4200 * 3 + 10000);
});

test('cobertura: mejor cobertura real cuando nadie cubre toda la lista', () => {
  const r = compareList(lista, [exact('arroz', 'euro', 4000), exact('leche', 'euro', 4200), exact('arroz', 'exito', 3900)], providers);
  assert.equal(r.singleStoreOptions.length, 0);
  assert.equal(r.bestCoverage?.providerId, 'euro');
  assert.equal(r.bestCoverage?.exact, 2);
  assert.equal(r.bestCoverage?.coveragePct, 66.7);
});

test('cobertura: sin ningún exacto no hay mejor cobertura', () => {
  const r = compareList(lista, [offerWith('arroz', 'd1', { match: 'PROBABLE' })], providers);
  assert.equal(r.bestCoverage, null);
});

test('cobertura: distingue exactos, probables, equivalentes, sin precio, no encontrado, no disponible y pendiente', () => {
  const r = compareList(
    lista,
    [
      exact('arroz', 'd1', 3800),
      offerWith('leche', 'd1', { match: 'PROBABLE' }),
      offerWith('cafe', 'd1', { match: 'EQUIVALENTE' }),
      offerWith('arroz', 'euro', { status: 'SIN_PRECIO', match: 'EXACTO' }),
      offerWith('leche', 'euro', { status: 'NO_ENCONTRADO', match: 'NO_ENCONTRADO', product: null }),
      offerWith('cafe', 'euro', { status: 'PROVEEDOR_NO_DISPONIBLE', match: 'NO_ENCONTRADO', product: null }),
      offerWith('arroz', 'ara', { status: 'PENDIENTE_INTEGRACION', match: 'NO_ENCONTRADO', product: null }),
    ],
    providers,
  );
  const d1 = r.coverage.find((c) => c.providerId === 'd1')!;
  assert.deepEqual([d1.exact, d1.probable, d1.equivalent, d1.found], [1, 1, 1, 3]);
  const euro = r.coverage.find((c) => c.providerId === 'euro')!;
  assert.deepEqual([euro.noPrice, euro.notFound, euro.unavailable, euro.found], [1, 1, 1, 1]);
  assert.equal(r.coverage.find((c) => c.providerId === 'ara')!.pending, 1);
});

test('máximo ahorro: elige el más barato por producto, multiplica por cantidad y agrupa por supermercado', () => {
  const r = compareList(
    lista,
    [exact('arroz', 'euro', 4000), exact('arroz', 'exito', 3900), exact('leche', 'euro', 4200), exact('leche', 'exito', 4500), exact('cafe', 'd1', 9000)],
    providers,
  );
  const plan = r.maxSavings;
  assert.equal(plan.total, 3900 * 2 + 4200 * 3 + 9000);
  assert.deepEqual(plan.lines.map((l) => [l.itemId, l.providerId, l.lineTotal]), [
    ['arroz', 'exito', 7800],
    ['leche', 'euro', 12600],
    ['cafe', 'd1', 9000],
  ]);
  assert.equal(plan.byProvider.length, 3);
  assert.equal(plan.missing.length, 0);
});

test('máximo ahorro: el ahorro se calcula contra alternativas comparables', () => {
  const r = compareList(
    lista,
    [exact('arroz', 'euro', 4000), exact('arroz', 'exito', 3900), exact('leche', 'euro', 4200), exact('leche', 'exito', 4500), exact('cafe', 'euro', 11000), exact('cafe', 'exito', 10000)],
    providers,
  );
  const euro = r.maxSavings.comparisons.find((c) => c.providerId === 'euro')!;
  assert.equal(euro.coversWholePlan, true);
  // Euro: 8000 + 12600 + 11000 = 31600. Plan: 7800 + 12600 + 10000 = 30400.
  assert.equal(euro.providerCost, 31600);
  assert.equal(euro.planCost, 30400);
  assert.equal(euro.savings, 1200);
});

test('máximo ahorro: productos sin exacto quedan como faltantes', () => {
  const r = compareList(lista, [exact('arroz', 'euro', 4000), offerWith('leche', 'euro', { match: 'PROBABLE' })], providers);
  assert.deepEqual(r.maxSavings.missing.map((i) => i.id), ['leche', 'cafe']);
});

test('máximo ahorro: PROBABLES y EQUIVALENTES nunca entran silenciosamente', () => {
  const r = compareList(lista, [offerWith('arroz', 'euro', { match: 'PROBABLE' }), offerWith('arroz', 'd1', { match: 'EQUIVALENTE' })], providers);
  assert.equal(r.maxSavings.total, 0);
  assert.equal(r.maxSavings.itemsCovered, 0);
});

test('Rappi: precio no confirmado para la ciudad queda aparte y fuera de totales', () => {
  const rappi = exact('arroz', 'rappi', 1000, { includedInTotals: false, eligible: false, locationConfirmed: false, exclusionReason: 'Bogotá' });
  const r = compareList(lista, [exact('arroz', 'euro', 4000), rappi], providers);
  assert.equal(r.maxSavings.lines[0].providerId, 'euro', 'Rappi más barato pero excluido');
  assert.equal(r.excludedOffers.length, 1);
  assert.equal(r.coverage.find((c) => c.providerId === 'rappi')!.exact, 0);
  assert.equal(r.coverage.find((c) => c.providerId === 'rappi')!.excluded, 1);
});

test('lista vacía no produce recomendaciones', () => {
  const r = compareList([], [], providers);
  assert.equal(r.singleStoreOptions.length, 0);
  assert.equal(r.bestCoverage, null);
});

test('aparte: solo exactos excluidos; probables y equivalentes no se listan como precios aparte', () => {
  const r = compareList(
    lista,
    [
      offerWith('arroz', 'exito', { match: 'PROBABLE', includedInTotals: false }),
      offerWith('leche', 'd1', { match: 'EQUIVALENTE', includedInTotals: false }),
      exact('cafe', 'rappi', 9000, { includedInTotals: false, eligible: false, exclusionReason: 'marketplace' }),
    ],
    providers,
  );
  assert.deepEqual(r.excludedOffers.map((o) => o.providerId), ['rappi']);
});

// ---------- Cuánto ahorras ----------

test('ahorro: frente al supermercado único más barato que tiene todo, con cantidades', () => {
  // Plan: arroz en Éxito (3900×2), leche en Euro (4200×3), café en Éxito (10000).
  // Solo Éxito: 7800 + 13500 + 10000 = 31300. Solo Euro: 8000 + 12600 + 11000 = 31600.
  const r = compareList(
    lista,
    [
      exact('arroz', 'exito', 3900), exact('leche', 'exito', 4500), exact('cafe', 'exito', 10000),
      exact('arroz', 'euro', 4000), exact('leche', 'euro', 4200), exact('cafe', 'euro', 11000),
    ],
    providers,
  );
  const s = r.maxSavings.savings;
  assert.equal(r.maxSavings.total, 7800 + 12600 + 10000);
  assert.equal(s.reference?.providerId, 'exito', 'se compara con el más barato de los que tienen todo (conservador)');
  assert.equal(s.bySplitting, 31300 - 30400);
  assert.equal(s.bySplittingPct, Math.round((900 / 31300) * 1000) / 10);
});

test('ahorro: si todo sale de un supermercado, se compara con otro, no consigo mismo', () => {
  const r = compareList(lista, [exact('arroz', 'd1', 3000), exact('leche', 'd1', 3000), exact('cafe', 'd1', 9000), exact('arroz', 'exito', 3900), exact('leche', 'exito', 4500), exact('cafe', 'exito', 10000)], providers);
  const s = r.maxSavings.savings;
  assert.equal(s.reference?.providerId, 'exito');
  assert.equal(s.bySplitting, 7800 + 13500 + 10000 - (6000 + 9000 + 9000));
});

test('ahorro: si ningún supermercado tiene todo, se compara con el que tiene más y lo indica', () => {
  const r = compareList(lista, [exact('arroz', 'exito', 3900), exact('leche', 'euro', 4200), exact('arroz', 'euro', 4100), exact('cafe', 'd1', 9000)], providers);
  const s = r.maxSavings.savings;
  assert.equal(s.reference?.providerId, 'euro');
  assert.equal(s.reference?.coversWholePlan, false);
  assert.equal(s.reference?.itemsCompared, 2);
  assert.equal(s.bySplitting, 4100 * 2 - 3900 * 2);
});

test('ahorro: promociones frente al precio normal, multiplicadas por cantidad', () => {
  const promo = exact('arroz', 'exito', 4936);
  promo.product = { ...promo.product!, listPrice: 6700 };
  const r = compareList(lista, [promo, exact('leche', 'exito', 4200)], providers);
  const s = r.maxSavings.savings;
  assert.equal(s.byPromotions, (6700 - 4936) * 2);
  assert.equal(s.regularTotal, 6700 * 2 + 4200 * 3);
});

test('ahorro: sin otro supermercado con qué comparar, no se inventa ahorro', () => {
  const r = compareList(lista, [exact('arroz', 'exito', 3900)], providers);
  const s = r.maxSavings.savings;
  assert.equal(s.reference, null);
  assert.equal(s.bySplitting, 0);
});
