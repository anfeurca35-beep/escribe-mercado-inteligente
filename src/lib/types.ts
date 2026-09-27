// Tipos centrales de Mercado Inteligente.
// Regla fundamental: un precio es `number` solo si fue leído de una fuente real.
// Si no hay precio verificable, el valor es `null`. Nunca 0 como relleno.

export type ProviderId = 'exito' | 'vaquita' | 'd1' | 'ara' | 'euro' | 'rappi';

export type CityId = 'medellin' | 'bogota' | 'cali' | 'barranquilla';

/** Estado de matching entre lo que pidió el usuario y lo que ofrece el proveedor. */
export type MatchStatus = 'EXACTO' | 'PROBABLE' | 'EQUIVALENTE' | 'NO_ENCONTRADO';

/** Estado de la consulta de un producto en un proveedor. */
export type OfferStatus =
  | 'OK' // producto localizado con precio utilizable
  | 'SIN_PRECIO' // producto localizado, pero sin precio utilizable (o agotado)
  | 'NO_ENCONTRADO' // el proveedor respondió y no hubo coincidencia válida
  | 'PROVEEDOR_NO_DISPONIBLE' // error, timeout, 403, robots, no opera en la ciudad
  | 'PENDIENTE_INTEGRACION'; // no existe integración funcional

export interface ListItem {
  id: string;
  /** Texto libre, p. ej. "Arroz Diana 1000 g" */
  name: string;
  /** Cantidad solicitada (entero ≥ 1) */
  quantity: number;
}

/** Producto tal como lo reporta un proveedor. */
export interface ProviderProduct {
  externalId: string | null;
  name: string;
  brand: string | null;
  /** Precio de venta real verificado, o null. */
  price: number | null;
  /** Precio antes de promoción, solo si es mayor que `price`. */
  listPrice: number | null;
  /** true/false si el proveedor lo indica; null si no se sabe. */
  available: boolean | null;
  url: string | null;
  /** Tienda que vende (relevante en marketplaces como Rappi). */
  seller: string | null;
}

export interface MatchResult {
  status: MatchStatus;
  /** Explicaciones legibles para el usuario. */
  reasons: string[];
}

export interface Offer {
  itemId: string;
  providerId: ProviderId;
  status: OfferStatus;
  match: MatchStatus;
  matchReasons: string[];
  product: ProviderProduct | null;
  /** Productos distintos que podrían sustituir. Nunca se usan en totales. */
  equivalents: ProviderProduct[];
  /** ¿Se pudo confirmar que el precio corresponde a la ciudad del usuario? */
  locationConfirmed: boolean;
  /** Si es false, el precio se muestra aparte y no entra en totales ni recomendaciones. */
  includedInTotals: boolean;
  exclusionReason: string | null;
  /** Mensaje para estados de error / pendiente. */
  note: string | null;
  fetchedAt: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  integration: 'activo' | 'parcial' | 'pendiente';
  pendingReason: string | null;
  /** Ciudades donde opera. 'todas' = cobertura nacional. */
  cities: CityId[] | 'todas';
  /** true = sus precios no entran en totales si no se confirma ciudad y costos. */
  marketplace: boolean;
  limitation: string | null;
}

export interface ProviderPricesResponse {
  providerId: ProviderId;
  city: CityId;
  offers: Offer[];
  fetchedAt: string;
}
