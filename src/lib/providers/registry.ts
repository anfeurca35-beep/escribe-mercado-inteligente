// Registro de proveedores. Activar/desactivar se hace con configuración
// (variables de entorno leídas en las rutas API), sin tocar código.

import type { ProviderId } from '../types';
import { PROVIDER_INFO, PROVIDER_ORDER } from './info';
import {
  createMarketplaceProvider,
  createPendingProvider,
  createVtexProvider,
  type SupermarketProvider,
} from './base';
import { parseEuroProductHtml, parseExitoProductHtml } from './parsers';

export { PROVIDER_INFO, PROVIDER_ORDER } from './info';

export interface ProviderConfig {
  /** Proveedores apagados por configuración. */
  disabled: ProviderId[];
  exitoBaseUrl: string;
  euroBaseUrl: string;
  d1BaseUrl: string;
  d1HtmlSearch: string | null;
  rappiBaseUrl: string;
  rappiSearch: string;
}

export const DEFAULT_CONFIG: ProviderConfig = {
  disabled: [],
  exitoBaseUrl: 'https://www.exito.com',
  euroBaseUrl: 'https://www.eurosupermercados.com.co',
  d1BaseUrl: 'https://domicilios.tiendasd1.com',
  d1HtmlSearch: 'https://domicilios.tiendasd1.com/search?name={q}',
  rappiBaseUrl: 'https://www.rappi.com.co',
  rappiSearch: 'https://www.rappi.com.co/search?query={q}',
};

export function configFromEnv(env: Record<string, string | undefined>): ProviderConfig {
  const disabled = (env.PROVIDERS_DISABLED ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ProviderId => (PROVIDER_ORDER as string[]).includes(s));
  return {
    disabled,
    exitoBaseUrl: env.EXITO_BASE_URL || DEFAULT_CONFIG.exitoBaseUrl,
    euroBaseUrl: env.EURO_BASE_URL || DEFAULT_CONFIG.euroBaseUrl,
    d1BaseUrl: env.D1_BASE_URL || DEFAULT_CONFIG.d1BaseUrl,
    d1HtmlSearch: env.D1_SEARCH_URL || DEFAULT_CONFIG.d1HtmlSearch,
    rappiBaseUrl: env.RAPPI_BASE_URL || DEFAULT_CONFIG.rappiBaseUrl,
    rappiSearch: env.RAPPI_SEARCH_URL || DEFAULT_CONFIG.rappiSearch,
  };
}

export function buildRegistry(cfg: ProviderConfig = DEFAULT_CONFIG): Map<ProviderId, SupermarketProvider> {
  const all: Record<ProviderId, SupermarketProvider> = {
    exito: createVtexProvider({
      info: PROVIDER_INFO.exito,
      baseUrl: cfg.exitoBaseUrl,
      pricing: 'nacional',
      productPageParser: parseExitoProductHtml,
    }),
    vaquita: createPendingProvider(PROVIDER_INFO.vaquita),
    d1: createVtexProvider({
      info: PROVIDER_INFO.d1,
      baseUrl: cfg.d1BaseUrl,
      pricing: 'nacional',
      htmlSearchTemplate: cfg.d1HtmlSearch ?? undefined,
    }),
    ara: createPendingProvider(PROVIDER_INFO.ara),
    euro: createVtexProvider({
      info: PROVIDER_INFO.euro,
      baseUrl: cfg.euroBaseUrl,
      pricing: 'nacional',
      productPageParser: parseEuroProductHtml,
    }),
    rappi: createMarketplaceProvider({
      info: PROVIDER_INFO.rappi,
      baseUrl: cfg.rappiBaseUrl,
      searchTemplate: cfg.rappiSearch,
    }),
  };
  const registry = new Map<ProviderId, SupermarketProvider>();
  for (const id of PROVIDER_ORDER) {
    if (cfg.disabled.includes(id)) {
      registry.set(
        id,
        createPendingProvider({ ...PROVIDER_INFO[id], integration: 'pendiente', pendingReason: 'Desactivado por configuración.' }),
      );
    } else {
      registry.set(id, all[id]);
    }
  }
  return registry;
}
