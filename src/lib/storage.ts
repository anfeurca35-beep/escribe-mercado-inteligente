// Persistencia local en el dispositivo del usuario (sin servidor).
// Se guarda: listas, ciudad elegida y últimos precios consultados.
// No se guardan coordenadas ni fotos.

import { isCityId } from './location';
import type { SelectionMap } from './selection';
import type { CityId, ListItem, Offer, ProviderId, ProviderPricesResponse } from './types';

export interface SavedResults {
  city: CityId;
  responses: ProviderPricesResponse[];
  /** Lista tal como estaba al consultar, para detectar cambios. */
  signature: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
  results: SavedResults | null;
  /** Productos confirmados por el usuario en esta lista (itemId → proveedor → selección). */
  selections?: SelectionMap;
  /** Búsquedas refinadas a partir de un producto confirmado (itemId → refinamiento). */
  refinements?: Record<string, Refinement>;
}

/** Búsqueda más precisa para un ítem, derivada del producto que el usuario confirmó. */
export interface Refinement {
  /** Nombre del ítem cuando se creó (si el usuario lo cambia, deja de aplicar). */
  itemName: string;
  /** Texto usado para buscar y comparar en los demás supermercados. */
  text: string;
  fromProvider: ProviderId;
  productName: string;
}

export function refinementFor(list: Pick<ShoppingList, 'refinements'>, itemId: string, itemName: string): Refinement | null {
  const r = list.refinements?.[itemId];
  if (!r || r.itemName.trim().toLowerCase() !== itemName.trim().toLowerCase()) return null;
  return r;
}

/** Reemplaza la oferta de un ítem en la respuesta de un proveedor. */
export function mergeOffer(results: SavedResults, providerId: ProviderId, offer: Offer, fetchedAt: string): SavedResults {
  const responses = [...results.responses];
  const i = responses.findIndex((r) => r.providerId === providerId);
  if (i < 0) {
    responses.push({ providerId, city: results.city, fetchedAt, offers: [offer] });
  } else {
    const r = responses[i];
    const offers = r.offers.some((o) => o.itemId === offer.itemId)
      ? r.offers.map((o) => (o.itemId === offer.itemId ? offer : o))
      : [...r.offers, offer];
    responses[i] = { ...r, offers };
  }
  return { ...results, responses };
}

export interface AppState {
  version: 1;
  city: CityId | null;
  lists: ShoppingList[];
}

const KEY = 'mercado-inteligente:v1';

export function emptyState(): AppState {
  return { version: 1, city: null, lists: [] };
}

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      version: 1,
      city: isCityId(parsed.city) ? parsed.city : null,
      lists: Array.isArray(parsed.lists)
        ? parsed.lists
            .filter((l) => l && typeof l.id === 'string' && Array.isArray(l.items))
            .map((l) => (l.results && !resultsAreCurrent(l.results) ? { ...l, results: null } : l))
        : [],
    };
  } catch {
    return emptyState();
  }
}

/**
 * Los resultados guardados por versiones anteriores (sin opciones por producto)
 * se descartan: la lista se conserva y basta con volver a comparar.
 */
export function resultsAreCurrent(results: SavedResults): boolean {
  return (
    Array.isArray(results.responses) &&
    results.responses.every(
      (r) =>
        Array.isArray(r.offers) &&
        r.offers.every((o) => Array.isArray(o.candidates) && Array.isArray(o.others) && typeof o.selection === 'string'),
    )
  );
}

export function saveState(state: AppState): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function listSignature(items: ListItem[]): string {
  return items.map((i) => `${i.id}:${i.name.trim().toLowerCase()}`).join('|');
}
