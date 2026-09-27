// Contrato de proveedor y adaptadores reutilizables.

import type { CityId, ProviderInfo, ProviderProduct } from '../types';
import {
  cityIdFromName,
  extractEmbeddedProducts,
  extractNextData,
  parseJsonLdProducts,
  parseVtexSearch,
} from './parsers';
import { politeFetchText, ProviderFetchError } from './http';

export interface SearchContext {
  city: CityId;
}

export type SearchOutcome =
  | {
      kind: 'ok';
      products: ProviderProduct[];
      /** Ciudad a la que corresponden los precios, si se pudo confirmar. */
      confirmedCity: CityId | null;
    }
  | { kind: 'unavailable'; reason: string };

export interface SupermarketProvider {
  info: ProviderInfo;
  search(term: string, ctx: SearchContext): Promise<SearchOutcome>;
  /** Opcional: completa un producto sin precio leyendo su página. */
  enrich?(product: ProviderProduct): Promise<ProviderProduct>;
  /** Opcional: trae un producto concreto por su identificador (selección del usuario). */
  fetchByKey?(key: string): Promise<ProviderProduct | null>;
}

function tryJson(body: string): unknown | undefined {
  const t = body.trim();
  if (!(t.startsWith('[') || t.startsWith('{'))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function reasonOf(err: unknown): string {
  if (err instanceof ProviderFetchError) return err.message;
  return 'Error inesperado al consultar el proveedor.';
}

export interface VtexConfig {
  info: ProviderInfo;
  baseUrl: string;
  /**
   * Cómo interpretar la ciudad. 'nacional' = el precio publicado en el sitio
   * se toma como válido en las ciudades donde opera el proveedor.
   */
  pricing: 'nacional';
  /** Parser de página de producto para completar precios faltantes. */
  productPageParser?: (html: string, url: string) => ProviderProduct | null;
  /** Plantilla de búsqueda HTML de respaldo; {q} se reemplaza por el término. */
  htmlSearchTemplate?: string;
}

/**
 * Proveedor sobre VTEX. Usa los endpoints públicos de búsqueda de catálogo
 * (los mismos que usa el sitio para mostrar resultados) y, como respaldo,
 * la página de búsqueda HTML con datos estructurados.
 */
export function createVtexProvider(cfg: VtexConfig): SupermarketProvider {
  const { baseUrl } = cfg;
  return {
    info: cfg.info,
    async search(term, ctx) {
      const q = encodeURIComponent(term);
      const endpoints = [
        `${baseUrl}/api/catalog_system/pub/products/search?ft=${q}&_from=0&_to=39`,
        `${baseUrl}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=40&page=1&locale=es-CO`,
      ];
      let lastError: string | null = null;
      let answeredEmpty = false;
      for (const url of endpoints) {
        try {
          const res = await politeFetchText(url, { accept: 'application/json' });
          const json = res.status >= 200 && res.status < 300 ? tryJson(res.body) : undefined;
          if (json === undefined) {
            lastError = `Respuesta no utilizable (HTTP ${res.status}).`;
            continue;
          }
          const products = parseVtexSearch(json, baseUrl);
          if (products.length > 0) return { kind: 'ok', products, confirmedCity: ctx.city };
          answeredEmpty = true;
        } catch (err) {
          lastError = reasonOf(err);
        }
      }
      if (cfg.htmlSearchTemplate) {
        const html = await htmlSearch(cfg.htmlSearchTemplate, term, baseUrl);
        if (html.kind === 'ok' && html.products.length > 0) return { ...html, confirmedCity: ctx.city };
        if (html.kind === 'ok') answeredEmpty = true;
        else lastError = html.reason;
      }
      if (answeredEmpty) return { kind: 'ok', products: [], confirmedCity: ctx.city };
      return { kind: 'unavailable', reason: lastError ?? 'No se pudo consultar el proveedor.' };
    },
    async fetchByKey(key) {
      // Solo identificadores numéricos de SKU (VTEX).
      if (!/^\d{1,15}$/.test(key)) return null;
      try {
        const res = await politeFetchText(`${baseUrl}/api/catalog_system/pub/products/search?fq=skuId:${key}`, {
          accept: 'application/json',
        });
        const json = res.status >= 200 && res.status < 300 ? tryJson(res.body) : undefined;
        if (json === undefined) return null;
        return parseVtexSearch(json, baseUrl).find((p) => p.externalId === key) ?? null;
      } catch {
        return null;
      }
    },
    enrich: cfg.productPageParser
      ? async (product) => {
          if (!product.url || product.price !== null) return product;
          try {
            const res = await politeFetchText(product.url);
            if (res.status < 200 || res.status >= 300) return product;
            const parsed = cfg.productPageParser!(res.body, product.url);
            if (!parsed) return product;
            return { ...product, price: parsed.price, listPrice: parsed.listPrice ?? product.listPrice };
          } catch {
            return product;
          }
        }
      : undefined,
  };
}

export async function htmlSearch(
  template: string,
  term: string,
  baseUrl: string,
): Promise<{ kind: 'ok'; products: ProviderProduct[]; cities: string[] } | { kind: 'unavailable'; reason: string }> {
  const url = template.replace('{q}', encodeURIComponent(term));
  try {
    const res = await politeFetchText(url);
    if (res.status === 404) return { kind: 'unavailable', reason: 'La búsqueda del proveedor no existe en esa dirección (HTTP 404).' };
    if (res.status < 200 || res.status >= 300) return { kind: 'unavailable', reason: `Respuesta no utilizable (HTTP ${res.status}).` };
    const direct = tryJson(res.body);
    const data = direct !== undefined ? direct : extractNextData(res.body);
    const embedded = data !== null && data !== undefined ? extractEmbeddedProducts(data, baseUrl) : { products: [], cities: [] };
    const ld = parseJsonLdProducts(res.body, baseUrl);
    return { kind: 'ok', products: [...embedded.products, ...ld], cities: embedded.cities };
  } catch (err) {
    return { kind: 'unavailable', reason: reasonOf(err) };
  }
}

/**
 * Proveedor tipo marketplace (Rappi). Los precios dependen de ciudad y tienda.
 * Solo se confirma la ciudad si los datos la indican explícitamente.
 */
export function createMarketplaceProvider(cfg: {
  info: ProviderInfo;
  baseUrl: string;
  searchTemplate: string;
}): SupermarketProvider {
  return {
    info: cfg.info,
    async search(term) {
      const r = await htmlSearch(cfg.searchTemplate, term, cfg.baseUrl);
      if (r.kind === 'unavailable') return r;
      const ids = new Set(r.cities.map(cityIdFromName).filter((c): c is CityId => c !== null));
      const confirmedCity = ids.size === 1 ? [...ids][0] : null;
      return { kind: 'ok', products: r.products, confirmedCity };
    },
  };
}

/** Proveedor sin integración funcional: no hace ninguna llamada. */
export function createPendingProvider(info: ProviderInfo): SupermarketProvider {
  return {
    info,
    async search() {
      return { kind: 'unavailable', reason: info.pendingReason ?? 'Pendiente de integración.' };
    },
  };
}
