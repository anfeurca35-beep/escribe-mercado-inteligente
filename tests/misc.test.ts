import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListText } from '../src/lib/listParse';
import { cityFromCoords, isCityId } from '../src/lib/location';
import { RateLimiter } from '../src/lib/api/rateLimit';
import { formatCOP, formatRelative } from '../src/lib/format';

test('lista pegada: cantidades al inicio, entre paréntesis y viñetas', () => {
  const r = parseListText('2 Arroz Diana 1000 g\n- Leche entera Alquería 1 L (3)\n• Huevos AA x30\n3x Café Sello Rojo 250 g\n\n');
  assert.deepEqual(r, [
    { name: 'Arroz Diana 1000 g', quantity: 2 },
    { name: 'Leche entera Alquería 1 L', quantity: 3 },
    { name: 'Huevos AA x30', quantity: 1 },
    { name: 'Café Sello Rojo 250 g', quantity: 3 },
  ]);
});

test('lista pegada: un tamaño al inicio no se confunde con cantidad', () => {
  assert.deepEqual(parseListText('1 kg arroz'), [{ name: '1 kg arroz', quantity: 1 }]);
});

test('ubicación: coordenadas del Valle de Aburrá → Medellín; Bogotá; fuera de cobertura → null', () => {
  assert.equal(cityFromCoords(6.1719, -75.6099), 'medellin'); // Itagüí
  assert.equal(cityFromCoords(6.3373, -75.5579), 'medellin'); // Bello
  assert.equal(cityFromCoords(4.6533, -74.0836), 'bogota');
  assert.equal(cityFromCoords(7.1193, -73.1227), null); // Bucaramanga
  assert.equal(cityFromCoords(Number.NaN, 0), null);
  assert.equal(isCityId('medellin'), true);
  assert.equal(isCityId('lima'), false);
});

test('límite de peticiones por cliente', () => {
  const rl = new RateLimiter(2, 60);
  assert.equal(rl.allow('ip', 0), true);
  assert.equal(rl.allow('ip', 0), true);
  assert.equal(rl.allow('ip', 0), false);
  assert.equal(rl.allow('ip', 1000), true, 'se recarga con el tiempo');
  assert.equal(rl.allow('otra', 0), true);
});

test('formato de pesos y tiempo relativo', () => {
  assert.match(formatCOP(32600), /32\.600/);
  assert.equal(formatRelative('2026-09-24T12:00:00Z', new Date('2026-09-24T12:05:00Z')), 'hace 5 min');
});
