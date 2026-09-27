// Validación de entradas de las rutas API. Nunca confiar en el cliente.

import { isCityId } from './location';
import type { CityId, ListItem, ProviderId } from './types';

export const LIMITS = { maxItems: 30, maxName: 120, maxQty: 99, maxIdLength: 40 };

const PROVIDER_IDS: ProviderId[] = ['exito', 'vaquita', 'd1', 'ara', 'euro', 'rappi'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);
}

export interface PricesRequest {
  providerId: ProviderId;
  city: CityId;
  items: ListItem[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export function validatePricesRequest(body: unknown): Validation<PricesRequest> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido.' };
  const b = body as Record<string, unknown>;
  if (!isProviderId(b.providerId)) return { ok: false, error: 'Proveedor inválido.' };
  if (!isCityId(b.city)) return { ok: false, error: 'Ciudad inválida.' };
  if (!Array.isArray(b.items)) return { ok: false, error: 'La lista debe ser un arreglo.' };
  if (b.items.length === 0) return { ok: false, error: 'La lista está vacía.' };
  if (b.items.length > LIMITS.maxItems) return { ok: false, error: `Máximo ${LIMITS.maxItems} productos por consulta.` };

  const items: ListItem[] = [];
  const seen = new Set<string>();
  for (const raw of b.items) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Producto inválido.' };
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > LIMITS.maxIdLength || !/^[\w-]+$/.test(r.id)) {
      return { ok: false, error: 'Identificador de producto inválido.' };
    }
    if (seen.has(r.id)) return { ok: false, error: 'Identificadores repetidos.' };
    seen.add(r.id);
    if (typeof r.name !== 'string') return { ok: false, error: 'Nombre de producto inválido.' };
    const name = r.name.replace(/[\u0000-\u001f]/g, ' ').trim();
    if (name.length < 2 || name.length > LIMITS.maxName) {
      return { ok: false, error: `El nombre debe tener entre 2 y ${LIMITS.maxName} caracteres.` };
    }
    if (typeof r.quantity !== 'number' || !Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > LIMITS.maxQty) {
      return { ok: false, error: `La cantidad debe ser un entero entre 1 y ${LIMITS.maxQty}.` };
    }
    let pin: string | undefined;
    if (r.pin !== undefined && r.pin !== null) {
      if (typeof r.pin !== 'string' || r.pin.length === 0 || r.pin.length > 300 || /[\u0000-\u001f]/.test(r.pin)) {
        return { ok: false, error: 'Selección de producto inválida.' };
      }
      pin = r.pin;
    }
    let match: string | undefined;
    if (r.match !== undefined && r.match !== null) {
      if (typeof r.match !== 'string') return { ok: false, error: 'Búsqueda de producto inválida.' };
      const m = r.match.replace(/[\u0000-\u001f]/g, ' ').trim();
      if (m.length < 2 || m.length > 200) return { ok: false, error: 'Búsqueda de producto inválida.' };
      match = m;
    }
    const entry: ListItem = { id: r.id, name, quantity: r.quantity };
    if (pin) entry.pin = pin;
    if (match) entry.match = match;
    items.push(entry);
  }
  return { ok: true, value: { providerId: b.providerId, city: b.city, items } };
}
