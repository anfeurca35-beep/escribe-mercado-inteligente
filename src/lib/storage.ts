// Persistencia local en el dispositivo del usuario (sin servidor).
// Se guarda: listas, ciudad elegida y últimos precios consultados.
// No se guardan coordenadas ni fotos.

import { isCityId } from './location';
import type { CityId, ListItem, ProviderPricesResponse } from './types';

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
      lists: Array.isArray(parsed.lists) ? parsed.lists.filter((l) => l && typeof l.id === 'string' && Array.isArray(l.items)) : [],
    };
  } catch {
    return emptyState();
  }
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
