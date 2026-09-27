// Pruebas de extremo a extremo del pipeline de proveedores con red simulada:
// robots.txt → búsqueda → parser → matching → oferta.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathAllowed, parseRobots, setFetcherForTests } from '../src/lib/providers/http';
import { buildRegistry, DEFAULT_CONFIG } from '../src/lib/providers/registry';
import { lookupList } from '../src/lib/providers/lookup';
import { handlePricesRequest } from '../src/lib/api/prices';
import { item } from './helpers';

type Route = (url: URL) => { status: number; body: string } | Promise<{ status: number; body: string }>;

function fakeNet(route: Route): string[] {
  const calls: string[] = [];
  setFetcherForTests(async (url, init) => {
    calls.push(url);
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /checkout\n', { status: 200 });
    const r = await route(u);
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

afterEach(() => setFetcherForTests(null));

const vtex = (name: string, price: number, brand: string, extra: Record<string, unknown> = {}) => ({
  productId: name,
  productName: name,
  brand,
  linkText: name.toLowerCase().replace(/\s+/g, '-'),
  items: [{ itemId: name, name, sellers: [{ commertialOffer: { Price: price, ListPrice: price, AvailableQuantity: 10, ...extra } }] }],
});

test('robots.txt: respeta Disallow y Allow más específico', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /api/\nAllow: /api/catalog_system/pub/\n\nUser-agent: OtroBot\nDisallow: /');
  assert.equal(isPathAllowed(rules, '/api/private'), false);
  assert.equal(isPathAllowed(rules, '/api/catalog_system/pub/products/search?ft=x'), true);
  assert.equal(isPathAllowed(rules, '/arroz'), true);
});

test('proveedor VTEX real: exacto, equivalente y promoción', async () => {
  fakeNet(() => ({
    status: 200,
    body: JSON.stringify([vtex('Arroz Diana x 1000 gr', 4936, 'DIANA', { ListPrice: 6700 }), vtex('Arroz Roa x 1000 gr', 4500, 'ROA')]),
  }));
  const exito = buildRegistry().get('exito')!;
  const [o] = await lookupList(exito, [item('a', 'Arroz Diana 1000 g', 2)], 'medellin');
  assert.equal(o.status, 'OK');
  assert.equal(o.match, 'EXACTO');
  assert.equal(o.product?.price, 4936);
  assert.equal(o.product?.listPrice, 6700);
  assert.equal(o.includedInTotals, true);
  assert.deepEqual(o.equivalents.map((e) => e.name), ['Arroz Roa x 1000 gr']);
});

test('proveedor no disponible: 403 no se evade y no inventa precio', async () => {
  fakeNet(() => ({ status: 403, body: 'Forbidden' }));
  const [o] = await lookupList(buildRegistry().get('euro')!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
  assert.equal(o.status, 'PROVEEDOR_NO_DISPONIBLE');
  assert.equal(o.product, null);
  assert.match(o.note ?? '', /403/);
});

test('proveedor no disponible: robots.txt que prohíbe la ruta', async () => {
  setFetcherForTests(async (url) => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /', { status: 200 });
    throw new Error('no debería llamarse');
  });
  const [o] = await lookupList(buildRegistry().get('exito')!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
  assert.equal(o.status, 'PROVEEDOR_NO_DISPONIBLE');
  assert.match(o.note ?? '', /robots/);
});

test('proveedor no disponible: timeout', async () => {
  setFetcherForTests((url, init) => {
    if (url.endsWith('/robots.txt')) return Promise.resolve(new Response('', { status: 404 }));
    return new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  });
  const provider = buildRegistry().get('d1')!;
  const started = Date.now();
  const [o] = await lookupList(provider, [item('a', 'Arroz Diana 1000 g')], 'bogota');
  assert.equal(o.status, 'PROVEEDOR_NO_DISPONIBLE');
  assert.ok(Date.now() - started < 60000);
});

test('precio faltante: producto localizado sin precio queda SIN_PRECIO', async () => {
  fakeNet(() => ({ status: 200, body: JSON.stringify([vtex('Arroz Diana x 1000 gr', 0, 'DIANA', { AvailableQuantity: 0 })]) }));
  const [o] = await lookupList(buildRegistry().get('d1')!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
  assert.equal(o.status, 'SIN_PRECIO');
  assert.equal(o.product?.price, null);
  assert.equal(o.includedInTotals, false);
});

test('precio faltante: Euro completa el precio desde la página del producto', async () => {
  fakeNet((u) => {
    if (u.pathname.endsWith('/p')) {
      return { status: 200, body: '<title>ARROZ DIANA x 1000 GR - Euro Supermercados</title><div>ID #: 55</div><div>Precio con otros medios: $ 4.890</div>' };
    }
    return { status: 200, body: JSON.stringify([{ productId: '55', productName: 'ARROZ DIANA x 1000 GR', brand: 'DIANA', linkText: 'arroz-diana', items: [] }]) };
  });
  const [o] = await lookupList(buildRegistry().get('euro')!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
  assert.equal(o.status, 'OK');
  assert.equal(o.product?.price, 4890);
});

test('no encontrado: el proveedor responde sin coincidencias', async () => {
  fakeNet(() => ({ status: 200, body: JSON.stringify([vtex('Detergente Ariel 1 kg', 20000, 'ARIEL')]) }));
  const [o] = await lookupList(buildRegistry().get('exito')!, [item('a', 'Leche entera Alquería 1 L')], 'medellin');
  assert.equal(o.status, 'NO_ENCONTRADO');
});

test('Euro en Bogotá: no opera en la ciudad y no se consulta', async () => {
  const calls = fakeNet(() => ({ status: 200, body: '[]' }));
  const [o] = await lookupList(buildRegistry().get('euro')!, [item('a', 'Arroz Diana 1000 g')], 'bogota');
  assert.equal(o.status, 'PROVEEDOR_NO_DISPONIBLE');
  assert.match(o.note ?? '', /no opera/);
  assert.equal(calls.length, 0);
});

test('pendientes: Ara y Vaquita no hacen llamadas ni muestran precios', async () => {
  const calls = fakeNet(() => ({ status: 200, body: '[]' }));
  const reg = buildRegistry();
  for (const id of ['ara', 'vaquita'] as const) {
    const [o] = await lookupList(reg.get(id)!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
    assert.equal(o.status, 'PENDIENTE_INTEGRACION');
    assert.equal(o.product, null);
  }
  assert.equal(calls.length, 0);
});

test('Rappi: precio de Bogotá con usuario en Medellín queda fuera de totales', async () => {
  const data = { props: { pageProps: { city: 'Bogotá', products: [{ id: 1, name: 'Gaseosa Coca-Cola 1.5 L', price: 6580, is_available: true }] } } };
  setFetcherForTests(async (url) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`, { status: 200 });
  });
  const [o] = await lookupList(buildRegistry().get('rappi')!, [item('a', 'Gaseosa Coca-Cola 1.5 L')], 'medellin');
  assert.equal(o.status, 'OK');
  assert.equal(o.match, 'EXACTO');
  assert.equal(o.locationConfirmed, false);
  assert.equal(o.includedInTotals, false);
  assert.match(o.exclusionReason ?? '', /Medellín/);
});

test('Rappi: aun con ciudad confirmada, sin costos conocidos no entra en totales', async () => {
  const data = { props: { pageProps: { city: 'Bogotá', products: [{ id: 1, name: 'Gaseosa Coca-Cola 1.5 L', price: 6580, is_available: true }] } } };
  setFetcherForTests(async (url) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`, { status: 200 });
  });
  const [o] = await lookupList(buildRegistry().get('rappi')!, [item('a', 'Gaseosa Coca-Cola 1.5 L')], 'bogota');
  assert.equal(o.locationConfirmed, true);
  assert.equal(o.includedInTotals, false);
  assert.match(o.exclusionReason ?? '', /marketplace/);
});

test('configuración: un proveedor puede desactivarse sin tocar código', async () => {
  const calls = fakeNet(() => ({ status: 200, body: '[]' }));
  const reg = buildRegistry({ ...DEFAULT_CONFIG, disabled: ['d1'] });
  const [o] = await lookupList(reg.get('d1')!, [item('a', 'Arroz Diana 1000 g')], 'medellin');
  assert.equal(o.status, 'PENDIENTE_INTEGRACION');
  assert.equal(calls.length, 0);
});

test('API: valida el cuerpo y no filtra detalles internos', async () => {
  const reg = buildRegistry();
  assert.equal((await handlePricesRequest(null, reg)).status, 400);
  assert.equal((await handlePricesRequest({ providerId: 'walmart', city: 'medellin', items: [] }, reg)).status, 400);
  assert.equal((await handlePricesRequest({ providerId: 'exito', city: 'lima', items: [item('a', 'Arroz')] }, reg)).status, 400);
  assert.equal((await handlePricesRequest({ providerId: 'exito', city: 'medellin', items: [{ id: 'a', name: 'Arroz', quantity: 0 }] }, reg)).status, 400);
  assert.equal((await handlePricesRequest({ providerId: 'exito', city: 'medellin', items: [{ id: 'a b', name: 'Arroz', quantity: 1 }] }, reg)).status, 400);
  const many = Array.from({ length: 31 }, (_, i) => item(`i${i}`, 'Arroz Diana 1000 g'));
  assert.equal((await handlePricesRequest({ providerId: 'exito', city: 'medellin', items: many }, reg)).status, 400);
});

test('API: respuesta válida con ofertas por producto', async () => {
  fakeNet(() => ({ status: 200, body: JSON.stringify([vtex('Arroz Diana x 1000 gr', 4936, 'DIANA')]) }));
  const r = await handlePricesRequest({ providerId: 'exito', city: 'medellin', items: [item('a', 'Arroz Diana 1000 g', 2)] }, buildRegistry());
  assert.equal(r.status, 200);
  const body = r.body as { offers: Array<{ status: string }> };
  assert.equal(body.offers[0].status, 'OK');
});
