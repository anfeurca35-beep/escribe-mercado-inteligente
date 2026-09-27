// Matching honesto entre lo que pide el usuario y lo que ofrece un proveedor.
//
// Regla crítica: marca + cantidad NO basta para EXACTO. También deben
// coincidir el tipo de producto, la variante/sabor/fórmula cuando se
// pueden identificar, y la presentación.

import { KNOWN_BRANDS, STOPWORDS, VARIANT_GROUPS } from './brands';
import {
  compareCount,
  compareSize,
  normalizeText,
  parsePresentation,
  type Comparison,
  type Presentation,
} from './units';
import type { MatchResult, MatchStatus, ProviderProduct } from './types';

const PHRASES: Array<[RegExp, string]> = [
  [/\bsin azucar\b/g, 'sinazucar'],
  [/\bsin lactosa\b/g, 'deslactosada'],
  [/\bsemi descremada\b/g, 'semidescremada'],
  [/\b(?:en )?aceite de oliva\b/g, 'oliva'],
  [/\b(?:en )?aceite de girasol\b/g, 'girasol'],
  [/\blomitos? en agua\b/g, 'agua'],
  [/\ben agua\b/g, 'agua'],
  [/\ben aceite\b/g, 'aceite'],
];

const VARIANT_TOKENS = new Set(Object.values(VARIANT_GROUPS).flat());
const BRANDS_BY_LENGTH = [...new Set(KNOWN_BRANDS)].sort((a, b) => b.length - a.length);

// Elimina expresiones de tamaño y conteo del texto normalizado para no
// confundirlas con descriptores.
const SIZE_STRIP_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kgs?|kilos?|kilogramos?|grs?|gramos?|g|lbs?|libras?|litros?|lts?|lt|l|mls?|cc|cm3)\b/g;
const COUNT_STRIP_RE = /\b(?:x\s*\d+|\d+\s*(?:unidades|unidad|und|unds|uds|un|rollos?|huevos|piezas|sobres|barras))\b/g;

function applyPhrases(norm: string): string {
  let out = norm;
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out;
}

function compact(s: string): string {
  return s.replace(/[^a-z0-9]/g, '');
}

/** Singularización simple, aplicada igual a ambos lados. */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith('es') && /[lnr]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenize(norm: string, removePhrases: string[]): string[] {
  let text = ` ${norm} `;
  for (const phrase of removePhrases) {
    if (phrase) text = text.split(` ${phrase} `).join(' ');
  }
  text = text.replace(SIZE_STRIP_RE, ' ').replace(COUNT_STRIP_RE, ' ');
  return text
    .split(/[\s.,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

export function detectBrand(norm: string): string | null {
  const padded = ` ${norm} `;
  const compactNorm = compact(norm);
  for (const brand of BRANDS_BY_LENGTH) {
    if (padded.includes(` ${brand} `)) return brand;
    // "cocacola", "vancamps" escritos sin espacio
    if (brand.includes(' ') && compactNorm.includes(compact(brand))) return brand;
  }
  return null;
}

export interface ParsedQuery {
  raw: string;
  norm: string;
  brand: string | null;
  presentation: Presentation;
  descriptors: string[];
  /** Tipo de producto (primer descriptor que no es variante), p. ej. "arroz". */
  noun: string | null;
  variants: string[];
}

export function parseQuery(raw: string): ParsedQuery {
  const norm = applyPhrases(normalizeText(raw));
  const brand = detectBrand(norm);
  const descriptors = tokenize(norm, brand ? [brand] : []);
  const variants = descriptors.filter((t) => VARIANT_TOKENS.has(t));
  const noun = descriptors.find((t) => !VARIANT_TOKENS.has(t)) ?? null;
  return { raw, norm, brand, presentation: parsePresentation(raw), descriptors, noun, variants };
}

/** Texto de búsqueda para el proveedor: tipo + marca + variantes, sin tamaños. */
export function searchTermFor(query: ParsedQuery): string {
  const parts = [query.noun, query.brand, ...query.variants].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  const unique = [...new Set(parts)];
  if (unique.length > 0) return unique.join(' ');
  return query.norm.replace(SIZE_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
}

function brandState(query: ParsedQuery, candNorm: string, candBrand: string | null): Comparison {
  const candCompact = compact(candNorm);
  if (query.brand) {
    const q = compact(query.brand);
    if (candCompact.includes(q)) return 'igual';
    if (candBrand && compact(candBrand) === q) return 'igual';
    return 'distinto';
  }
  // El usuario no escribió una marca conocida: reconocerla con la marca del proveedor.
  if (candBrand) {
    const b = compact(candBrand);
    if (b.length >= 3 && compact(query.norm).includes(b)) return 'igual';
  }
  return 'no_aplica';
}

function variantGroupsOf(token: string): string[] {
  return Object.entries(VARIANT_GROUPS)
    .filter(([, list]) => list.includes(token))
    .map(([group]) => group);
}

export function classify(query: ParsedQuery, product: Pick<ProviderProduct, 'name' | 'brand'>): MatchResult {
  const candNorm = applyPhrases(normalizeText(`${product.name} ${product.brand ?? ''}`));
  const candBrandNorm = product.brand ? normalizeText(product.brand) : detectBrand(candNorm);
  const brand = brandState(query, candNorm, candBrandNorm);

  const removeFromCandidate = [query.brand, candBrandNorm].filter((b): b is string => !!b);
  const candTokens = new Set(tokenize(candNorm, removeFromCandidate));
  const candPresentation = parsePresentation(product.name);

  const size = compareSize(query.presentation.size, candPresentation.size);
  const count = compareCount(query.presentation.count, candPresentation.count);

  // Si la marca se reconoció con el dato del proveedor, sus palabras no son descriptores.
  const brandTokens =
    !query.brand && brand === 'igual' && candBrandNorm ? new Set(tokenize(candBrandNorm, [])) : new Set<string>();
  const descriptors = query.descriptors.filter((d) => !brandTokens.has(d));
  const noun = descriptors.find((t) => !VARIANT_TOKENS.has(t)) ?? null;

  const nounPresent = noun !== null && candTokens.has(noun);
  const missing = descriptors.filter((d) => !candTokens.has(d));

  // Conflicto de variante: el usuario pidió X y el producto trae otra variante del mismo grupo.
  const conflicts: string[] = [];
  for (const q of query.variants) {
    if (candTokens.has(q)) continue;
    const groups = variantGroupsOf(q);
    for (const c of candTokens) {
      if (c === q || descriptors.includes(c)) continue;
      if (variantGroupsOf(c).some((g) => groups.includes(g))) conflicts.push(`${q} ≠ ${c}`);
    }
  }
  // Variantes presentes en el producto que el usuario no pidió.
  const extras = [...candTokens].filter((t) => VARIANT_TOKENS.has(t) && !descriptors.includes(t));

  const reasons: string[] = [];
  const result = (status: MatchStatus): MatchResult => ({ status, reasons });

  // ¿El candidato es relevante?
  const relevant = brand === 'igual' || nounPresent;
  if (!relevant) {
    reasons.push('No coincide la marca ni el tipo de producto.');
    return result('NO_ENCONTRADO');
  }

  if (brand === 'distinto') {
    if (nounPresent) {
      reasons.push(`Otra marca (se pidió ${query.brand}).`);
      return result('EQUIVALENTE');
    }
    reasons.push('Otra marca y otro producto.');
    return result('NO_ENCONTRADO');
  }

  if (brand === 'no_aplica' && !nounPresent) {
    reasons.push('No coincide el tipo de producto.');
    return result('NO_ENCONTRADO');
  }

  if (size === 'distinto' || count === 'distinto') {
    reasons.push('Presentación diferente (tamaño o unidades).');
    return result('EQUIVALENTE');
  }

  if (conflicts.length > 0) {
    reasons.push(`Variante diferente: ${conflicts.join(', ')}.`);
    return result('EQUIVALENTE');
  }

  let probable = false;
  if (descriptors.length === 0) {
    probable = true;
    reasons.push('Solo coinciden marca y tamaño. Escribe también qué producto es (por ejemplo "atún en agua") para confirmar que es exacto.');
  }
  if (missing.length > 0 && descriptors.length > 0) {
    probable = true;
    reasons.push(`No se pudo verificar: ${missing.join(', ')}.`);
  }
  if (extras.length > 0) {
    probable = true;
    reasons.push(`El producto indica una variante que no pediste: ${extras.join(', ')}.`);
  }
  if (!query.presentation.size && !query.presentation.count) {
    probable = true;
    reasons.push('No indicaste tamaño; agrega gramos, ml o unidades para comparar exacto.');
  } else if (size === 'desconocido' || count === 'desconocido') {
    probable = true;
    reasons.push('El proveedor no muestra la presentación completa.');
  }

  if (probable) return result('PROBABLE');
  reasons.push(brand === 'igual' ? 'Coinciden marca, producto, variante y presentación.' : 'Coinciden producto, variante y presentación.');
  return result('EXACTO');
}

export const MATCH_RANK: Record<MatchStatus, number> = {
  EXACTO: 0,
  PROBABLE: 1,
  EQUIVALENTE: 2,
  NO_ENCONTRADO: 3,
};
