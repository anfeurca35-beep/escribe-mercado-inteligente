// Selección del usuario: qué producto corresponde a cada ítem en cada supermercado.
// Se guarda por lista, solo en el dispositivo del usuario. No es una regla global.

import { hasUsablePrice } from './providers/lookup';
import type { Offer, ProviderId } from './types';

export type UserSelection =
  | { kind: 'producto'; key: string; itemName: string }
  | { kind: 'ninguno'; itemName: string };

/** itemId → proveedor → selección */
export type SelectionMap = Record<string, Partial<Record<ProviderId, UserSelection>>>;

function sameItemName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Devuelve la selección vigente para un ítem y proveedor. Si el usuario cambió
 * el nombre del producto en la lista, la selección anterior ya no aplica.
 */
export function selectionFor(
  selections: SelectionMap | undefined,
  itemId: string,
  itemName: string,
  providerId: ProviderId,
): UserSelection | null {
  const sel = selections?.[itemId]?.[providerId];
  if (!sel || !sameItemName(sel.itemName, itemName)) return null;
  return sel;
}

/** Aplica la selección del usuario a una oferta. Función pura. */
export function applySelection(offer: Offer, sel: UserSelection | null): Offer {
  if (!sel) return offer;
  if (sel.kind === 'ninguno') {
    return {
      ...offer,
      selection: 'rechazado',
      includedInTotals: false,
      note: 'Indicaste que ninguna opción corresponde.',
    };
  }
  // El usuario puede elegir cualquier opción: coincidencias, alternativas (otra
  // marca/tamaño) u otras opciones descartadas. El sistema nunca elige una
  // alternativa por su cuenta; aquí la eligió el usuario.
  const chosen = [...offer.candidates, ...offer.equivalents, ...offer.others].find((c) => c.key === sel.key);
  if (!chosen) {
    return {
      ...offer,
      selection: 'pendiente',
      includedInTotals: false,
      note: 'El producto que habías elegido ya no aparece en este supermercado. Elige de nuevo.',
    };
  }
  const usable = hasUsablePrice(chosen.product);
  return {
    ...offer,
    product: chosen.product,
    match: chosen.match,
    matchReasons:
      chosen.match === 'EXACTO' || chosen.match === 'PROBABLE'
        ? ['Confirmado por ti.']
        : ['Elegido por ti: es distinto a lo que escribiste (otra marca, tamaño o variante).'],
    status: usable ? 'OK' : 'SIN_PRECIO',
    selection: 'usuario',
    includedInTotals: usable && offer.eligible,
    note: usable ? null : chosen.product.available === false ? 'Agotado en el proveedor.' : 'Sin precio utilizable.',
  };
}

/** Aplica todas las selecciones guardadas de una lista. */
export function applySelections(
  offers: Offer[],
  selections: SelectionMap | undefined,
  itemNames: Map<string, string>,
): Offer[] {
  return offers.map((o) => {
    const name = itemNames.get(o.itemId);
    return name === undefined ? o : applySelection(o, selectionFor(selections, o.itemId, name, o.providerId));
  });
}

/** Actualiza el mapa de selecciones (null = volver a la elección automática). */
export function setSelection(
  selections: SelectionMap | undefined,
  itemId: string,
  providerId: ProviderId,
  sel: UserSelection | null,
): SelectionMap {
  const next: SelectionMap = { ...(selections ?? {}) };
  const forItem = { ...(next[itemId] ?? {}) };
  if (sel) forItem[providerId] = sel;
  else delete forItem[providerId];
  next[itemId] = forItem;
  return next;
}

/** Clave fijada que se envía al servidor para que traiga ese producto aunque la búsqueda cambie. */
export function pinFor(
  selections: SelectionMap | undefined,
  itemId: string,
  itemName: string,
  providerId: ProviderId,
): string | undefined {
  const sel = selectionFor(selections, itemId, itemName, providerId);
  return sel?.kind === 'producto' ? sel.key : undefined;
}
