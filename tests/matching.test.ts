import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseQuery, searchTermFor } from '../src/lib/matching';

const m = (q: string, name: string, brand: string | null = null) => classify(parseQuery(q), { name, brand }).status;

test('matching: EXACTO requiere marca, producto, variante y presentación', () => {
  assert.equal(m('Arroz Diana 1000 g', 'ARROZ DIANA x 1000 GR', 'DIANA'), 'EXACTO');
  assert.equal(m('Leche entera Alquería 1 L', 'Leche Entera ALQUERIA x 1000 ml'), 'EXACTO');
  assert.equal(m('Azúcar blanca Manuelita 1000 g', 'AZUCAR MANUELITA BLANCA x 1000 GR', 'MANUELITA'), 'EXACTO');
});

test('matching: marca + cantidad NO es suficiente (caso Van Camp\'s 160 g)', () => {
  assert.notEqual(m("Van Camp's 160 g", 'Atun Van Camps en aceite de oliva 160 g'), 'EXACTO');
  assert.notEqual(m('Familia x12', 'Servilletas Familia x12'), 'EXACTO');
  assert.equal(m("Atún Van Camp's en agua 160 g", 'Atun Van Camps en aceite de oliva 160 g'), 'EQUIVALENTE');
  assert.equal(m("Atún Van Camp's 160 g", 'Atun Van Camps en aceite de oliva 160 g'), 'PROBABLE');
});

test('matching: otra marca del mismo producto es EQUIVALENTE, nunca el mismo', () => {
  assert.equal(m('Leche entera Alquería 1 L', 'Leche Entera Colanta 1000 ml', 'COLANTA'), 'EQUIVALENTE');
  assert.equal(m('Leche entera Alquería 1 L', 'Leche Entera Parmalat 1 L', 'PARMALAT'), 'EQUIVALENTE');
});

test('matching: variante distinta del mismo grupo es EQUIVALENTE', () => {
  assert.equal(m('Leche entera Alquería 1 L', 'Leche Deslactosada Alqueria 1000 ml'), 'EQUIVALENTE');
  assert.equal(m('Azúcar blanca Manuelita 1000 g', 'Azucar Morena Manuelita 1000 g'), 'EQUIVALENTE');
  assert.equal(m('Huevos AA x30', 'Huevos AAA x30'), 'EQUIVALENTE');
});

test('matching: presentación distinta es EQUIVALENTE', () => {
  assert.equal(m('Arroz Diana 1000 g', 'Arroz Diana 500 g', 'DIANA'), 'EQUIVALENTE');
  assert.equal(m('Gaseosa Coca-Cola 1.5 L', 'Gaseosa Coca-Cola x 2 und 1.5 L'), 'EQUIVALENTE');
});

test('matching: variante no pedida o dato no verificable es PROBABLE', () => {
  assert.equal(m('Arroz Diana 1000 g', 'Arroz Diana Premium 1000 g', 'DIANA'), 'PROBABLE');
  assert.equal(m('Crema dental Colgate 90 ml', 'Crema Dental Colgate Triple Acción 90 ml'), 'PROBABLE');
  assert.equal(m('Pan tajado Bimbo', 'Pan Tajado Bimbo 600 g', 'BIMBO'), 'PROBABLE');
  assert.equal(m('Arroz Diana 1000 g', 'Arroz Diana', 'DIANA'), 'PROBABLE');
});

test('matching: producto sin relación es NO_ENCONTRADO', () => {
  assert.equal(m('Leche entera Alquería 1 L', 'Arroz Diana 1000 g', 'DIANA'), 'NO_ENCONTRADO');
  assert.equal(m('Chocolate Luker 500 g', 'Detergente Ariel 1 kg', 'ARIEL'), 'NO_ENCONTRADO');
});

test('matching: 1000 ml y 1 L equivalen para EXACTO', () => {
  assert.equal(m('Gaseosa Coca-Cola 1.5 L', 'Gaseosa Coca-Cola 1500 ml', 'COCA-COLA'), 'EXACTO');
});

test('matching: marca desconocida se reconoce con la marca del proveedor', () => {
  assert.equal(m('Galletas Festival fresa 12 und', 'Galletas FESTIVAL Fresa x 12 und', 'FESTIVAL'), 'EXACTO');
});

test('matching: el término de búsqueda no incluye tamaños', () => {
  assert.equal(searchTermFor(parseQuery('Arroz Diana 1000 g')), 'arroz diana');
  assert.equal(searchTermFor(parseQuery('Leche entera Alquería 1 L')), 'leche alqueria entera');
});
