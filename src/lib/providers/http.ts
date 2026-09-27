// Cliente HTTP compartido por los proveedores.
// - Timeout por petición.
// - Máximo de peticiones simultáneas y pausa mínima por sitio.
// - Caché en memoria con vencimiento.
// - Respeta robots.txt (RFC 9309). No evade bloqueos, CAPTCHA ni sesiones.

export const USER_AGENT =
  'MercadoInteligente/1.0 (comparador de precios de listas de mercado; consultas bajo demanda)';

export type FetchErrorKind = 'timeout' | 'bloqueado' | 'http' | 'red' | 'robots';

export class ProviderFetchError extends Error {
  constructor(
    public kind: FetchErrorKind,
    public httpStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderFetchError';
  }
}

export interface FetchTextResult {
  status: number;
  body: string;
  contentType: string;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

let fetcher: Fetcher = (url, init) => fetch(url, init);

/** Solo para pruebas: reemplaza la función de red. */
export function setFetcherForTests(f: Fetcher | null): void {
  fetcher = f ?? ((url, init) => fetch(url, init));
  cache.clear();
  robotsCache.clear();
  hostState.clear();
}

// ---------- límite por sitio ----------

interface HostState {
  active: number;
  lastStart: number;
  queue: Array<() => void>;
}

const MAX_CONCURRENT_PER_HOST = 2;
const MIN_GAP_MS = 250;
const hostState = new Map<string, HostState>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function acquire(host: string): Promise<void> {
  let st = hostState.get(host);
  if (!st) {
    st = { active: 0, lastStart: 0, queue: [] };
    hostState.set(host, st);
  }
  const state = st;
  if (state.active >= MAX_CONCURRENT_PER_HOST) {
    await new Promise<void>((resolve) => state.queue.push(resolve));
  }
  state.active++;
  const wait = state.lastStart + MIN_GAP_MS - Date.now();
  state.lastStart = Math.max(Date.now(), state.lastStart + MIN_GAP_MS);
  if (wait > 0) await sleep(wait);
}

function release(host: string): void {
  const st = hostState.get(host);
  if (!st) return;
  st.active = Math.max(0, st.active - 1);
  const next = st.queue.shift();
  if (next) next();
}

// ---------- caché ----------

interface CacheEntry {
  expires: number;
  value: FetchTextResult;
}
const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 800;
export const DEFAULT_TTL_MS = 20 * 60 * 1000;

function cacheGet(key: string): FetchTextResult | null {
  const e = cache.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: FetchTextResult, ttl: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + ttl, value });
}

// ---------- petición base ----------

async function rawFetch(url: string, timeoutMs: number, accept: string): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'es-CO,es;q=0.9' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = await res.text();
    return { status: res.status, body, contentType: res.headers.get('content-type') ?? '' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderFetchError('timeout', null, 'El proveedor tardó demasiado en responder.');
    }
    throw new ProviderFetchError('red', null, 'No se pudo conectar con el proveedor.');
  } finally {
    clearTimeout(timer);
  }
}

// ---------- robots.txt ----------

interface RobotsRules {
  disallowAll: boolean;
  allow: string[];
  disallow: string[];
}
const robotsCache = new Map<string, { expires: number; rules: RobotsRules }>();
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;

export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallowAll: false, allow: [], disallow: [] };
  let applies = false;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      const matches = agent === '*' || agent.includes('mercadointeligente');
      applies = lastWasAgent ? applies || matches : matches;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!applies) continue;
    if (key === 'disallow' && value) rules.disallow.push(value);
    if (key === 'allow' && value) rules.allow.push(value);
  }
  return rules;
}

function ruleMatches(rule: string, path: string): number {
  // Soporta '*' y '$' según RFC 9309. Devuelve la longitud del match o -1.
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp(`^${pattern}${anchored ? '$' : ''}`);
  return re.test(path) ? rule.length : -1;
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  if (rules.disallowAll) return false;
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const r of rules.allow) bestAllow = Math.max(bestAllow, ruleMatches(r, path));
  for (const r of rules.disallow) bestDisallow = Math.max(bestDisallow, ruleMatches(r, path));
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}

async function robotsFor(origin: string): Promise<RobotsRules> {
  const hit = robotsCache.get(origin);
  if (hit && hit.expires > Date.now()) return hit.rules;
  let rules: RobotsRules;
  try {
    const res = await rawFetch(`${origin}/robots.txt`, 6000, 'text/plain');
    if (res.status >= 200 && res.status < 300) rules = parseRobots(res.body);
    else if (res.status >= 400 && res.status < 500) rules = { disallowAll: false, allow: [], disallow: [] };
    else rules = { disallowAll: true, allow: [], disallow: [] }; // 5xx: no rastrear
  } catch {
    // Inalcanzable: se asume prohibido (RFC 9309, sección 2.3.1.4).
    rules = { disallowAll: true, allow: [], disallow: [] };
  }
  robotsCache.set(origin, { expires: Date.now() + ROBOTS_TTL_MS, rules });
  return rules;
}

// ---------- API pública ----------

export interface FetchOptions {
  timeoutMs?: number;
  ttlMs?: number;
  accept?: string;
}

/**
 * Descarga texto respetando robots.txt, límites y caché.
 * Lanza ProviderFetchError si no se puede obtener una respuesta utilizable.
 */
export async function politeFetchText(url: string, opts: FetchOptions = {}): Promise<FetchTextResult> {
  const { timeoutMs = 9000, ttlMs = DEFAULT_TTL_MS, accept = 'text/html,application/json;q=0.9,*/*;q=0.8' } = opts;
  const cached = cacheGet(url);
  if (cached) return cached;

  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  if (!isPathAllowed(rules, u.pathname + u.search)) {
    throw new ProviderFetchError('robots', null, 'El sitio no permite esta consulta automática (robots.txt).');
  }

  await acquire(u.host);
  try {
    const res = await rawFetch(url, timeoutMs, accept);
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new ProviderFetchError('bloqueado', res.status, `El proveedor rechazó la consulta (HTTP ${res.status}).`);
    }
    if (res.status >= 500) {
      throw new ProviderFetchError('http', res.status, `El proveedor respondió con error (HTTP ${res.status}).`);
    }
    if (res.status >= 200 && res.status < 300) cacheSet(url, res, ttlMs);
    return res;
  } finally {
    release(u.host);
  }
}
