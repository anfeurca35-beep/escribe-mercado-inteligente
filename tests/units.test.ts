import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCount, compareSize, parseCount, parseLocaleNumber, parseSize } from '../src/lib/units';

test('unidades: 1 L y 1000 ml son la misma presentación', () => {
  assert.deepEqual(parseSize('Leche 1 L'), { dimension: 'volume', value: 1000 });
  assert.deepEqual(parseSize('Leche x 1000 ml'), { dimension: 'volume', value: 1000 });
  assert.equal(compareSize(parseSize('1 L'), parseSize('1000 ml')), 'igual');
});

test('unidades: 1 kg y 1000 g son la misma presentación', () => {
  assert.equal(compareSize(parseSize('1 kg'), parseSize('1000 g')), 'igual');
  assert.equal(compareSize(parseSize('1 kg'), parseSize('1.000 gr')), 'igual');
});

test('unidades: decimales y miles al estilo colombiano', () => {
  assert.equal(parseLocaleNumber('1.000'), 1000);
  assert.equal(parseLocaleNumber('1.5'), 1.5);
  assert.equal(parseLocaleNumber('1,5'), 1.5);
  assert.deepEqual(parseSize('Coca-Cola 1.5 L'), { dimension: 'volume', value: 1500 });
  assert.deepEqual(parseSize('Coca-Cola 1,5 Lt'), { dimension: 'volume', value: 1500 });
});

test('unidades: tamaños distintos y dimensiones distintas no coinciden', () => {
  assert.equal(compareSize(parseSize('500 g'), parseSize('1000 g')), 'distinto');
  assert.equal(compareSize(parseSize('1 L'), parseSize('1 kg')), 'distinto');
  assert.equal(compareSize(parseSize('1 L'), null), 'desconocido');
});

test('unidades: x12 y 12 unidades son el mismo conteo', () => {
  assert.equal(parseCount('Papel Familia x12'), 12);
  assert.equal(parseCount('Papel Familia 12 unidades'), 12);
  assert.equal(parseCount('Papel Familia x 12 rollos'), 12);
  assert.equal(parseCount('Huevos AA x30'), 30);
  assert.equal(parseCount('Jabón Protex x3 und 110 g'), 3);
});

test('unidades: "x 1000 ml" es tamaño, no conteo', () => {
  assert.equal(parseCount('Leche entera x 1000 ml'), null);
  assert.equal(parseCount('Arroz x 1000 gr'), null);
});

test('unidades: paquete x2 frente a presentación individual es distinto', () => {
  assert.equal(compareCount(null, 2), 'distinto');
  assert.equal(compareCount(null, null), 'no_aplica');
  assert.equal(compareCount(12, 12), 'igual');
  assert.equal(compareCount(12, null), 'desconocido');
});
