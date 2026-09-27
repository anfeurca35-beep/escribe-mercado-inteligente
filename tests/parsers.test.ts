// Pruebas de parsers. Los fixtures son reconstrucciones con la ESTRUCTURA
// documentada de cada sitio (no son copias de páginas reales). La prueba con
// datos reales se hace en producción.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmbeddedProducts,
  extractNextData,
  parseCopPrice,
  parseEuroProductHtml,
  parseExitoProductHtml,
  parseJsonLdProducts,
  parseVtexSearch,
} from '../src/lib/providers/parsers';

test('precios: formatos colombianos y rechazo de valores inválidos', () => {
  assert.equal(parseCopPrice('$ 4.936'), 4936);
  assert.equal(parseCopPrice('$6.700'), 6700);
  assert.equal(parseCopPrice('32.600,00'), 32600);
  assert.equal(parseCopPrice(4936), 4936);
  assert.equal(parseCopPrice('$ -'), null);
  assert.equal(parseCopPrice('-'), null);
  assert.equal(parseCopPrice(0), null, 'nunca $0');
  assert.equal(parseCopPrice(''), null);
  assert.equal(parseCopPrice('gratis'), null);
});

const vtexArroz = [
  {
    productId: '552155',
    productName: 'Arroz Diana x 1000 gr',
    brand: 'DIANA',
    linkText: 'arroz-diana-x-1000-gr-552155',
    items: [
      {
        itemId: '552155',
        nameComplete: 'Arroz Diana x 1000 gr',
        sellers: [{ sellerName: 'Éxito', commertialOffer: { Price: 4936, ListPrice: 6700, AvailableQuantity: 40 } }],
      },
    ],
  },
  {
    productId: '999',
    productName: 'Arroz Roa x 1000 gr',
    brand: 'ROA',
    link: 'https://www.exito.com/arroz-roa/p',
    items: [{ itemId: '999', name: 'Arroz Roa x 1000 gr', sellers: [{ commertialOffer: { Price: 0, ListPrice: 0, AvailableQuantity: 0 } }] }],
  },
];

test('VTEX: precio promocional real y precio de lista', () => {
  const [a] = parseVtexSearch(vtexArroz, 'https://www.exito.com');
  assert.equal(a.price, 4936);
  assert.equal(a.listPrice, 6700);
  assert.equal(a.brand, 'DIANA');
  assert.equal(a.available, true);
  assert.equal(a.url, 'https://www.exito.com/arroz-diana-x-1000-gr-552155/p');
});

test('VTEX: Price 0 se interpreta como sin precio, nunca $0', () => {
  const [, b] = parseVtexSearch(vtexArroz, 'https://www.exito.com');
  assert.equal(b.price, null);
  assert.equal(b.available, false);
});

test('VTEX: acepta respuesta de intelligent-search ({ products })', () => {
  const r = parseVtexSearch({ products: vtexArroz }, 'https://www.eurosupermercados.com.co');
  assert.equal(r.length, 2);
});

test('VTEX: varios SKU producen productos separados con su tamaño', () => {
  const r = parseVtexSearch(
    [
      {
        productId: '1',
        productName: 'Leche Entera Alquería',
        brand: 'ALQUERIA',
        items: [
          { itemId: 'a', name: '1000 ml', sellers: [{ commertialOffer: { Price: 4200, AvailableQuantity: 5 } }] },
          { itemId: 'b', name: '1100 ml bolsa', sellers: [{ commertialOffer: { Price: 4500, AvailableQuantity: 5 } }] },
        ],
      },
    ],
    'https://x',
  );
  assert.deepEqual(r.map((p) => p.name), ['Leche Entera Alquería 1000 ml', 'Leche Entera Alquería 1100 ml bolsa']);
});

test('VTEX: respuesta vacía o con forma extraña no inventa productos', () => {
  assert.deepEqual(parseVtexSearch([], 'x'), []);
  assert.deepEqual(parseVtexSearch({ error: 'x' }, 'x'), []);
  assert.deepEqual(parseVtexSearch(null, 'x'), []);
});

const euroHtml = `<!doctype html><html><head><title>ATUN VAN CAMPS ACEITE DE OLIVA x 160 GR - Euro Supermercados</title></head>
<body><h1>ATUN VAN CAMPS ACEITE DE OLIVA x 160 GR</h1><div>ID #: 123456</div>
<div>Precio con otros medios: $ 8.950</div></body></html>`;

test('Euro: nombre desde <title>, precio desde "Precio con otros medios", ID', () => {
  const p = parseEuroProductHtml(euroHtml, 'https://www.eurosupermercados.com.co/x/p');
  assert.ok(p);
  assert.equal(p.name, 'ATUN VAN CAMPS ACEITE DE OLIVA x 160 GR');
  assert.equal(p.price, 8950);
  assert.equal(p.externalId, '123456');
  assert.equal(p.brand, 'VAN CAMPS');
});

test('Euro: página 200 sin contenido de producto devuelve null', () => {
  assert.equal(parseEuroProductHtml('<html><head><title>Euro Supermercados</title></head><body>Hola</body></html>', 'u'), null);
});

test('Euro: precio "$ -" queda como null', () => {
  const p = parseEuroProductHtml(euroHtml.replace('$ 8.950', '$ -'), 'u');
  assert.ok(p);
  assert.equal(p.price, null);
});

const exitoHtml = `<html><head><meta property="product:price:amount" content="4936">
<meta property="product:original_price:amount" content="6700"><title>Arroz Diana 1000 g | Éxito</title></head>
<body><h1>Arroz Blanco Diana 1000 g</h1><span>DIANA-PLU: 552155</span><span>$ 4.936</span><s>$ 6.700</s></body></html>`;

test('Éxito: precio desde product:price:amount, marca y PLU desde texto', () => {
  const p = parseExitoProductHtml(exitoHtml, 'https://www.exito.com/x/p');
  assert.ok(p);
  assert.equal(p.price, 4936);
  assert.equal(p.listPrice, 6700);
  assert.equal(p.brand, 'DIANA');
  assert.equal(p.externalId, '552155');
  assert.equal(p.name, 'Arroz Blanco Diana 1000 g');
});

test('Éxito: página 200 que muestra "$ -" devuelve precio null', () => {
  const html = `<html><head><title>Chocolate | Éxito</title></head><body><h1>Chocolate Luker 500 g</h1><span>LUKER-PLU: 1</span><span>$ -</span></body></html>`;
  const p = parseExitoProductHtml(html, 'u');
  assert.ok(p);
  assert.equal(p.price, null);
});

test('JSON-LD: extrae producto, precio y disponibilidad', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Huevos AA x30","brand":{"@type":"Brand","name":"Kikes"},"sku":"77","offers":{"@type":"Offer","price":"16900","availability":"https://schema.org/InStock"}}</script>`;
  const [p] = parseJsonLdProducts(html, 'https://d1');
  assert.equal(p.price, 16900);
  assert.equal(p.brand, 'Kikes');
  assert.equal(p.available, true);
});

test('Rappi: extrae productos, tienda, promoción, agotado y ciudad del JSON embebido', () => {
  const data = {
    props: {
      pageProps: {
        address: { city: 'Bogotá' },
        stores: [
          {
            store: { name: 'Makro' },
            products: [
              { id: 1, name: 'Azúcar Manuelita 1000 g', price: 4360, real_price: 5450, is_available: true },
              { id: 2, name: 'Papel Higiénico Familia x12', price: 23900, is_available: false },
            ],
          },
          { store_name: null, products: [{ id: 3, name: 'Gaseosa Coca-Cola 1.5 L', price: 6580, is_available: true }] },
        ],
      },
    },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  const parsed = extractNextData(html);
  const r = extractEmbeddedProducts(parsed, 'https://www.rappi.com.co');
  const azucar = r.products.find((p) => p.name.startsWith('Azúcar'));
  assert.ok(azucar);
  assert.equal(azucar.price, 4360);
  assert.equal(azucar.listPrice, 5450);
  assert.equal(azucar.seller, 'Makro');
  const papel = r.products.find((p) => p.name.startsWith('Papel'));
  assert.equal(papel?.available, false);
  const coca = r.products.find((p) => p.name.startsWith('Gaseosa'));
  assert.equal(coca?.seller, null, 'tienda no confirmada');
  assert.deepEqual(r.cities, ['Bogotá']);
});
