// Normalización de texto, tamaños y unidades.

/** Minúsculas, sin tildes, sin apóstrofes, guiones como espacio. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Dimension = 'mass' | 'volume';

export interface Size {
  dimension: Dimension;
  /** gramos para masa, mililitros para volumen */
  value: number;
}

export interface Presentation {
  size: Size | null;
  /** Unidades por paquete (x12, 12 unidades, x3). null si no se indica. */
  count: number | null;
}

const UNIT_FACTORS: Record<string, { dimension: Dimension; factor: number }> = {
  kg: { dimension: 'mass', factor: 1000 },
  kgs: { dimension: 'mass', factor: 1000 },
  kilo: { dimension: 'mass', factor: 1000 },
  kilos: { dimension: 'mass', factor: 1000 },
  kilogramo: { dimension: 'mass', factor: 1000 },
  kilogramos: { dimension: 'mass', factor: 1000 },
  g: { dimension: 'mass', factor: 1 },
  gr: { dimension: 'mass', factor: 1 },
  grs: { dimension: 'mass', factor: 1 },
  gramo: { dimension: 'mass', factor: 1 },
  gramos: { dimension: 'mass', factor: 1 },
  lb: { dimension: 'mass', factor: 500 }, // libra colombiana = 500 g
  libra: { dimension: 'mass', factor: 500 },
  libras: { dimension: 'mass', factor: 500 },
  l: { dimension: 'volume', factor: 1000 },
  lt: { dimension: 'volume', factor: 1000 },
  lts: { dimension: 'volume', factor: 1000 },
  litro: { dimension: 'volume', factor: 1000 },
  litros: { dimension: 'volume', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  mls: { dimension: 'volume', factor: 1 },
  cc: { dimension: 'volume', factor: 1 },
  cm3: { dimension: 'volume', factor: 1 },
};

const UNIT_ALT = Object.keys(UNIT_FACTORS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// número + unidad. El número admite "1.000", "1,5", "1.5", "250".
const SIZE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})(?![a-z])`, 'g');

const COUNT_WORDS = 'unidades|unidad|und|unds|un|uds|rollos|rollo|huevos|piezas|pack|sobres|barras';
const COUNT_AFTER_RE = new RegExp(`(\\d+)\\s*(?:${COUNT_WORDS})(?![a-z])`);
const COUNT_X_RE = /(?:^|\s)x\s*(\d+)(?![.,]?\d)(?!\s*(?:kg|g|gr|grs|ml|l|lt|lts|cc|litros?|gramos?|kilos?)(?![a-z]))/;
const COUNT_PACK_RE = /(?:paquete|pack|caja|bandeja|display)\s*(?:de|x)?\s*(\d+)(?![.,]?\d)(?!\s*(?:kg|g|gr|ml|l|lt|cc)(?![a-z]))/;

/** Interpreta "1.000" como mil y "1.5"/"1,5" como decimal. */
export function parseLocaleNumber(raw: string): number {
  if (/^\d{1,3}\.\d{3}$/.test(raw)) return Number(raw.replace('.', ''));
  return Number(raw.replace(',', '.'));
}

export function parseSize(text: string): Size | null {
  const norm = normalizeText(text);
  SIZE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let found: Size | null = null;
  while ((m = SIZE_RE.exec(norm)) !== null) {
    const unit = UNIT_FACTORS[m[2]];
    const value = parseLocaleNumber(m[1]);
    if (!unit || !Number.isFinite(value) || value <= 0) continue;
    // Si hay varias medidas (p. ej. "x3 und 110 g"), se toma la primera con unidad.
    found = { dimension: unit.dimension, value: Math.round(value * unit.factor * 100) / 100 };
    break;
  }
  return found;
}

export function parseCount(text: string): number | null {
  const norm = normalizeText(text);
  const candidates = [COUNT_X_RE, COUNT_AFTER_RE, COUNT_PACK_RE];
  for (const re of candidates) {
    const m = norm.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0 && n < 1000) return n;
    }
  }
  return null;
}

export function parsePresentation(text: string): Presentation {
  return { size: parseSize(text), count: parseCount(text) };
}

export type Comparison = 'igual' | 'distinto' | 'desconocido' | 'no_aplica';

export function compareSize(query: Size | null, candidate: Size | null): Comparison {
  if (!query) return 'no_aplica';
  if (!candidate) return 'desconocido';
  if (query.dimension !== candidate.dimension) return 'distinto';
  const diff = Math.abs(query.value - candidate.value) / Math.max(query.value, candidate.value);
  return diff <= 0.01 ? 'igual' : 'distinto';
}

/**
 * Compara unidades por paquete. Si el usuario no indicó cantidad por paquete,
 * se asume presentación individual: un paquete x2 es presentación distinta.
 */
export function compareCount(query: number | null, candidate: number | null): Comparison {
  if (query === null) {
    if (candidate !== null && candidate > 1) return 'distinto';
    return 'no_aplica';
  }
  if (candidate === null) return 'desconocido';
  return query === candidate ? 'igual' : 'distinto';
}

export function formatSize(size: Size | null): string {
  if (!size) return '';
  if (size.dimension === 'mass') return size.value >= 1000 ? `${size.value / 1000} kg` : `${size.value} g`;
  return size.value >= 1000 ? `${size.value / 1000} L` : `${size.value} ml`;
}
