// Pruebas del flujo de selección / confirmación de productos.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { compareList } from '../src/lib/comparison';
import { parseQuery } from '../src/lib/matching';
import { setFetcherForTests } from '../src/lib/providers/http';
import { buildOffer, lookupList, MAX_CANDIDATES, productKey } from '../src/lib/providers/lookup';
import { buildRegistry } from '../src/lib/providers/registry';
import { applySelection, applySelections, pinFor, setSelection, type SelectionMap } from '../src/lib/selection';
import type { Offer, ProviderProduct } from '../src/lib/types';
import { validatePricesRequest } from '../src/lib/validation';
import { exact, item, product, providers } from './helpers';

afterEach(() => setFetcherForTests(null));

const base = (itemId = 'arroz', providerId: Offer['providerId'] = 'exito'): Offer => ({
  ...exact(itemId, providerId, 1),
  status: 'NO_ENCONTRADO',
  match: 'NO_ENCONTRADO',
  product: null,
  selection: 'no_aplica',
  includedInTotals: false,
});

const p = (name: string, price: number | null, id: string, brand: string | null = null): ProviderProduct =>
  product(name, price, { externalId: id, brand, image: `https://img.example/${id}.jpg` });

const offerFor = (q: string, products: ProviderProduct[], eligible = true) =>
  buildOffer(base(), parseQuery(q), products, eligible, eligible ? null : 'Rappi es un marketplace.');

test('selección: un único EXACTO con precio se elige automáticamente', () => {
  const o = offerFor('Café molido Sello Rojo 250 g', [
    p('Café SELLO ROJO tostado y molido (250 gr)', 13900, '1', 'SELLO ROJO'),
    p('Café SELLO ROJO aroma vainilla (250 gr)', 9400, '2', 'SELLO ROJO'),
  ]);
  assert.equal(o.selection, 'auto');
  assert.equal(o.match, 'EXACTO');
  assert.equal(o.includedInTotals, true);
  assert.equal(o.candidates.length, 2, 'se conservan las otras opciones para poder cambiar');
});

test('selección: varios candidatos probables (Diana Vitamor / Cosecha Especial) piden confirmación', () => {
  const o = offerFor('Arroz Diana 1 kg', [
    p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA'),
    p('Arroz DIANA cosecha especial (1000 gr)', 7928, 'c', 'DIANA'),
  ]);
  assert.equal(o.selection, 'pendiente');
  assert.equal(o.includedInTotals, false, 'no entra en totales hasta confirmar');
  assert.deepEqual(o.candidates.map((c) => c.key).sort(), ['c', 'v']);
  assert.equal(o.candidates[0].product.image, 'https://img.example/v.jpg');
});

test('selección: varios EXACTOS distintos también piden confirmación', () => {
  const o = offerFor('Huevos AA x30', [p('Huevo Tipo AA 30 und', 14990, 'a'), p('Huevos AA 30 unidades', 16500, 'b')]);
  assert.equal(o.selection, 'pendiente');
  assert.equal(o.includedInTotals, false);
});

test('selección: la definición de EXACTO no se relaja (Vitamor sigue siendo PROBABLE)', () => {
  const o = offerFor('Arroz Diana 1000 g', [p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA')]);
  assert.equal(o.candidates[0].match, 'PROBABLE');
  assert.equal(o.selection, 'pendiente');
});

test('selección: solo equivalentes se muestran como alternativas y nunca se eligen solos', () => {
  const o = offerFor('Leche entera Alquería 1 L', [p('Leche Entera Colanta 1000 ml', 3990, 'x', 'COLANTA')]);
  assert.equal(o.selection, 'no_aplica');
  assert.equal(o.candidates.length, 0);
  assert.equal(o.equivalents.length, 1);
  assert.equal(o.includedInTotals, false);
});

test('selección: no encontrado ofrece "otras opciones" solo si hay resultados relacionados', () => {
  const conOtras = offerFor('Galletas Festival fresa x12', [p('Wafer BRIDGE doble crema sabor a fresa (71 gr)', 2970, 's', 'BRIDGE')]);
  assert.equal(conOtras.status, 'NO_ENCONTRADO');
  assert.equal(conOtras.others.length, 1);
  const sinNada = offerFor("Atún Van Camp's 160 g", [p('Detergente Ariel 1 kg', 18000, 'd', 'ARIEL')]);
  assert.equal(sinNada.others.length, 0);
  assert.equal(sinNada.note, 'No encontramos este producto.');
});

test('selección: máximo 5 candidatos por supermercado', () => {
  const many = Array.from({ length: 12 }, (_, i) => p(`Arroz DIANA linea${i} (1000 gr)`, 4000 + i, `k${i}`, 'DIANA'));
  const o = offerFor('Arroz Diana 1000 g', many);
  assert.equal(o.candidates.length, MAX_CANDIDATES);
});

test('confirmación: el candidato elegido se usa con su precio y entra en la comparación con la cantidad', () => {
  const o = offerFor('Arroz Diana 1 kg', [
    p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA'),
    p('Arroz DIANA cosecha especial (1000 gr)', 7928, 'c', 'DIANA'),
  ]);
  const chosen = applySelection(o, { kind: 'producto', key: 'c', itemName: 'Arroz Diana 1 kg' });
  assert.equal(chosen.selection, 'usuario');
  assert.equal(chosen.product?.price, 7928);
  assert.equal(chosen.includedInTotals, true);
  const r = compareList([item('arroz', 'Arroz Diana 1 kg', 2)], [chosen], providers);
  const exito = r.coverage.find((c) => c.providerId === 'exito')!;
  assert.equal(exito.confirmed, 1);
  assert.equal(exito.usable, 1);
  assert.equal(exito.exactSubtotal, 7928 * 2);
  assert.equal(r.maxSavings.total, 7928 * 2);
  assert.equal(r.maxSavings.lines[0].confirmedByUser, true);
  assert.deepEqual(r.singleStoreOptions.map((s) => s.providerId), ['exito']);
});

test('confirmación: sin confirmar, el probable no entra en totales y cuenta como "por confirmar"', () => {
  const o = offerFor('Arroz Diana 1 kg', [p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA')]);
  const r = compareList([item('arroz', 'Arroz Diana 1 kg')], [o], providers);
  const exito = r.coverage.find((c) => c.providerId === 'exito')!;
  assert.equal(exito.toConfirm, 1);
  assert.equal(exito.usable, 0);
  assert.equal(r.maxSavings.total, 0);
});

test('confirmación: "Ninguno corresponde" excluye la oferta', () => {
  const o = offerFor('Café molido Sello Rojo 250 g', [p('Café SELLO ROJO tostado y molido (250 gr)', 13900, '1', 'SELLO ROJO')]);
  const r = applySelection(o, { kind: 'ninguno', itemName: 'Café molido Sello Rojo 250 g' });
  assert.equal(r.selection, 'rechazado');
  assert.equal(r.includedInTotals, false);
  const c = compareList([item('arroz', 'x')], [r], providers).coverage.find((x) => x.providerId === 'exito')!;
  assert.equal(c.rejected, 1);
  assert.equal(c.usable, 0);
});

test('confirmación: un equivalente no se puede seleccionar como el mismo producto', () => {
  const o = offerFor('Leche entera Alquería 1 L', [p('Leche Entera Colanta 1000 ml', 3990, 'x', 'COLANTA')]);
  const r = applySelection(o, { kind: 'producto', key: 'x', itemName: 'Leche entera Alquería 1 L' });
  assert.notEqual(r.selection, 'usuario');
  assert.equal(r.includedInTotals, false);
});

test('confirmación: se puede elegir una de las "otras opciones" descartadas', () => {
  const o = offerFor("Atún Van Camp's 160 g", [p('Lomitos de atún VAN CAMPS en agua 160 g', 8900, 't')]);
  const key = [...o.candidates, ...o.others][0].key;
  const r = applySelection(o, { kind: 'producto', key, itemName: "Atún Van Camp's 160 g" });
  assert.equal(r.selection, 'usuario');
  assert.equal(r.includedInTotals, true);
});

test('confirmación: si cambias el nombre del producto, la selección anterior deja de aplicar', () => {
  const o = offerFor('Arroz Diana 1 kg', [p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA')]);
  const sel: SelectionMap = { arroz: { exito: { kind: 'producto', key: 'v', itemName: 'Arroz Diana 1 kg' } } };
  assert.equal(applySelections([o], sel, new Map([['arroz', 'Arroz Diana 1 kg']]))[0].selection, 'usuario');
  assert.equal(applySelections([o], sel, new Map([['arroz', 'Arroz Roa 1 kg']]))[0].selection, 'pendiente');
  assert.equal(pinFor(sel, 'arroz', 'Arroz Roa 1 kg', 'exito'), undefined);
});

test('confirmación: cambiar la selección y volver a la elección automática', () => {
  let sel = setSelection(undefined, 'arroz', 'exito', { kind: 'producto', key: 'v', itemName: 'A' });
  sel = setSelection(sel, 'arroz', 'd1', { kind: 'ninguno', itemName: 'A' });
  assert.equal(pinFor(sel, 'arroz', 'A', 'exito'), 'v');
  sel = setSelection(sel, 'arroz', 'exito', null);
  assert.equal(pinFor(sel, 'arroz', 'A', 'exito'), undefined);
  assert.equal(sel.arroz.d1?.kind, 'ninguno');
});

test('confirmación: producto elegido que ya no aparece vuelve a pedir selección', () => {
  const o = offerFor('Arroz Diana 1 kg', [p('Arroz DIANA blanco vitamor (1000 gr)', 4150, 'v', 'DIANA')]);
  const r = applySelection(o, { kind: 'producto', key: 'desaparecido', itemName: 'Arroz Diana 1 kg' });
  assert.equal(r.selection, 'pendiente');
  assert.equal(r.includedInTotals, false);
  assert.match(r.note ?? '', /Elige de nuevo/);
});

test('Rappi: aun confirmado por el usuario, queda aparte y fuera de totales', () => {
  const o = offerFor('Arroz Diana 1 kg', [p('Arroz Diana blanco vitamor 1000 g', 7800, 'r')], false);
  const r = applySelection(o, { kind: 'producto', key: 'r', itemName: 'Arroz Diana 1 kg' });
  assert.equal(r.selection, 'usuario');
  assert.equal(r.includedInTotals, false);
  const c = compareList([item('arroz', 'Arroz Diana 1 kg')], [{ ...r, providerId: 'rappi' }], providers);
  assert.equal(c.maxSavings.total, 0);
  assert.equal(c.excludedOffers.length, 1);
});

test('proveedor: el producto elegido se trae por su código aunque la búsqueda ya no lo devuelva', async () => {
  const calls: string[] = [];
  setFetcherForTests(async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
    const sku = (id: string, name: string, price: number) => ({
      productId: id,
      productName: name,
      brand: 'DIANA',
      linkText: id,
      items: [{ itemId: id, name, images: [{ imageUrl: `https://exito.vteximg.com/${id}.jpg` }], sellers: [{ commertialOffer: { Price: price, AvailableQuantity: 5 } }] }],
    });
    const fq = u.searchParams.get('fq');
    if (fq === 'skuId:777') return new Response(JSON.stringify([sku('777', 'Arroz DIANA cosecha especial (1000 gr)', 7928)]));
    return new Response(JSON.stringify([sku('111', 'Arroz DIANA blanco vitamor (1000 gr)', 4150)]));
  });
  const [o] = await lookupList(buildRegistry().get('exito')!, [{ ...item('a', 'Arroz Diana 1 kg'), pin: '777' }], 'medellin');
  assert.ok(calls.some((c) => c.includes('fq=skuId:777')));
  const pinned = [...o.candidates, ...o.others].find((c) => c.key === '777');
  assert.ok(pinned, 'el producto fijado está entre las opciones');
  assert.equal(pinned.product.image, 'https://exito.vteximg.com/777.jpg');
  const r = applySelection(o, { kind: 'producto', key: '777', itemName: 'Arroz Diana 1 kg' });
  assert.equal(r.product?.price, 7928);
  assert.equal(r.includedInTotals, true);
});

test('clave de producto: usa el identificador del proveedor, luego URL, luego nombre', () => {
  assert.equal(productKey({ externalId: '9', url: 'u', name: 'n' }), '9');
  assert.equal(productKey({ externalId: null, url: 'u', name: 'n' }), 'u');
  assert.equal(productKey({ externalId: null, url: null, name: 'n' }), 'n');
});

test('API: acepta un producto fijado válido y rechaza uno inválido', () => {
  const ok = validatePricesRequest({ providerId: 'exito', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 1, pin: '777' }] });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.items[0].pin, '777');
  const bad = validatePricesRequest({ providerId: 'exito', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 1, pin: 5 }] });
  assert.equal(bad.ok, false);
});

test('producción: con la variante leída de la dirección, el café normal vuelve a elegirse solo', () => {
  const name = 'Café SELLO ROJO tostado y molido (250  gr)';
  const o = offerFor('Café molido Sello Rojo 250 g', [
    product(name, 13900, { externalId: '523968', brand: 'SELLO ROJO', url: 'https://tienda.exito.com/cafe-molido-34895/p' }),
    product(name, 22000, {
      externalId: '666452',
      brand: 'SELLO ROJO',
      url: 'https://tienda.exito.com/cafe-descafeinado-medio-tostado-y-molido-x-250-gr-661132/p',
    }),
  ]);
  assert.equal(o.selection, 'auto');
  assert.equal(o.product?.price, 13900);
});

test('producción: productos realmente distintos siguen pidiendo confirmación (Fruco doypack vs botella)', () => {
  const o = offerFor('Salsa de tomate Fruco 400 g', [
    p('Salsa de tomate FRUCO doy pack (400  gr)', 8350, 'a', 'FRUCO'),
    p('Salsa de tomate FRUCO botella (400  gr)', 15200, 'b', 'FRUCO'),
  ]);
  assert.equal(o.selection, 'pendiente');
});

test('resultados guardados por una versión anterior (sin opciones) se descartan', async () => {
  const { resultsAreCurrent } = await import('../src/lib/storage');
  const viejo = { city: 'medellin' as const, signature: '', responses: [{ providerId: 'exito' as const, city: 'medellin' as const, fetchedAt: '', offers: [{ itemId: 'a' }] }] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(resultsAreCurrent(viejo as any), false);
  const actual = { city: 'medellin' as const, signature: '', responses: [{ providerId: 'exito' as const, city: 'medellin' as const, fetchedAt: '', offers: [base()] }] };
  assert.equal(resultsAreCurrent(actual), true);
});

// ---------- Buscar el mismo producto en los demás supermercados ----------

test('refinar: la elección agrega línea, marca y tamaño; no relaja reglas', async () => {
  const { refineFromProduct, refinementAddsInfo, classify } = await import('../src/lib/matching');
  const premium = refineFromProduct('Arroz Diana 1 kg', { name: 'Arroz DIANA blanco premium (1000  gr)', brand: 'DIANA' });
  assert.equal(premium, 'Arroz Diana 1 kg premium');
  const q = parseQuery(premium);
  assert.equal(classify(q, { name: 'ARROZ DIANA PREMIUM 1000 G', brand: null }).status, 'EXACTO');
  assert.equal(classify(q, { name: 'ARROZ INTEGRAL DIANA 1.000 G', brand: null }).status, 'EQUIVALENTE');
  assert.equal(classify(q, { name: 'Arroz Diana blanco vitamor 1000g', brand: null }).status, 'EQUIVALENTE');
  assert.equal(classify(q, { name: 'Arroz Diana Premium 500 g', brand: null }).status, 'EQUIVALENTE');

  const huevos = refineFromProduct('Huevos AA x30', { name: 'Huevos AA KIKES Rojo Pet (30  und)', brand: 'KIKES' });
  assert.equal(classify(parseQuery(huevos), { name: 'Huevo Tipo Aa 30 Und', brand: null }).status, 'EQUIVALENTE', 'otra marca');
  assert.equal(classify(parseQuery(huevos), { name: 'Huevos AA Kikes 30 unidades', brand: null }).status, 'EXACTO');

  const pan = refineFromProduct('Pan tajado Bimbo', { name: 'Pan Tajado Bimbo Blanco Suave (350 Gr)', brand: 'BIMBO' });
  assert.match(pan, /350 g/, 'agrega el tamaño que no se había escrito');

  const zero = refineFromProduct('Gaseosa Coca-Cola 1.5 L', { name: 'Gaseosa Coca Cola ZERO botella (1500  ml)', brand: 'ZERO' });
  assert.equal(classify(parseQuery(zero), { name: 'Gaseosa Coca-Cola Original 1.5 L', brand: null }).status, 'PROBABLE');
  assert.equal(classify(parseQuery(zero), { name: 'Gaseosa Coca-Cola Zero 1.5 L', brand: null }).status, 'EXACTO');

  const descaf = refineFromProduct('Café molido Sello Rojo 250 g', {
    name: 'Café SELLO ROJO tostado y molido (250  gr)',
    brand: 'SELLO ROJO',
    url: 'https://tienda.exito.com/cafe-descafeinado-medio-tostado-y-molido-x-250-gr-661132/p',
  });
  assert.match(descaf, /descafeinado/);

  const igual = refineFromProduct('Café molido Sello Rojo 250 g', { name: 'Café SELLO ROJO tostado y molido (250  gr)', brand: 'SELLO ROJO' });
  assert.equal(refinementAddsInfo('Café molido Sello Rojo 250 g', igual), false, 'nada nuevo: no hace falta buscar de nuevo');
});

test('refinar: el proveedor compara con la búsqueda refinada y elige solo si hay un único exacto', async () => {
  setFetcherForTests(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
    const sku = (id: string, name: string, price: number) => ({
      productId: id,
      productName: name,
      brand: 'DIANA',
      linkText: id,
      items: [{ itemId: id, name, sellers: [{ commertialOffer: { Price: price, AvailableQuantity: 5 } }] }],
    });
    return new Response(
      JSON.stringify([sku('1', 'ARROZ DIANA PREMIUM 1000 G', 5200), sku('2', 'ARROZ INTEGRAL DIANA 1.000 G', 4500), sku('3', 'ARROZ DIANA VITAMOR 1000 G', 4100)]),
    );
  });
  const d1 = buildRegistry().get('d1')!;
  const [sinRefinar] = await lookupList(d1, [item('a', 'Arroz Diana 1 kg')], 'medellin');
  assert.equal(sinRefinar.selection, 'pendiente', 'sin la elección, hay duda');
  const [refinado] = await lookupList(d1, [{ ...item('a', 'Arroz Diana 1 kg'), match: 'Arroz Diana 1 kg premium' }], 'medellin');
  assert.equal(refinado.selection, 'auto');
  assert.equal(refinado.product?.price, 5200);
  assert.equal(refinado.includedInTotals, true);
});

test('refinar: API acepta y valida la búsqueda refinada', () => {
  const ok = validatePricesRequest({ providerId: 'd1', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 1, match: 'Arroz Diana premium' }] });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.items[0].match, 'Arroz Diana premium');
  assert.equal(validatePricesRequest({ providerId: 'd1', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 1, match: 7 }] }).ok, false);
  assert.equal(
    validatePricesRequest({ providerId: 'd1', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 1, match: 'x'.repeat(201) }] }).ok,
    false,
  );
});

test('refinar: la nueva oferta reemplaza solo ese producto en ese supermercado', async () => {
  const { mergeOffer, refinementFor } = await import('../src/lib/storage');
  const a = { ...base('a', 'd1'), note: 'viejo' };
  const b = { ...base('b', 'd1'), note: 'otro' };
  const results = { city: 'medellin' as const, signature: '', responses: [{ providerId: 'd1' as const, city: 'medellin' as const, fetchedAt: 't', offers: [a, b] }] };
  const merged = mergeOffer(results, 'd1', { ...a, note: 'nuevo' }, 't2');
  assert.deepEqual(merged.responses[0].offers.map((o) => o.note), ['nuevo', 'otro']);
  const added = mergeOffer(results, 'rappi', base('a', 'rappi'), 't2');
  assert.equal(added.responses.length, 2);
  const list = { refinements: { a: { itemName: 'Arroz Diana 1 kg', text: 'Arroz Diana 1 kg premium', fromProvider: 'exito' as const, productName: 'x' } } };
  assert.equal(refinementFor(list, 'a', 'Arroz Diana 1 kg')?.text, 'Arroz Diana 1 kg premium');
  assert.equal(refinementFor(list, 'a', 'Arroz Roa 1 kg'), null, 'si cambias el nombre, deja de aplicar');
});
