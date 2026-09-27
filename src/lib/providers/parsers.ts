// Parsers de datos de proveedores. Funciones puras: reciben texto, devuelven
// productos. Si no hay precio real, el precio es null (nunca 0).

import { detectBrand } from '../matching';
import { normalizeText } from '../units';
import type { CityId, ProviderProduct } from '../types';

// ---------- utilidades ----------

/** "$ 4.936", "4.936", "$4.936,00", 4936 → 4936. Devuelve null si no es un precio válido. */
export function parseCopPrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\s\u00a0]/g, '').replace(/^\$/, '');
  if (!/\d/.test(s) || /^-+$/.test(s)) return null;
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = Number(s.replace(',', '.'));
  else return null;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** Texto visible aproximado de un HTML (sin scripts ni estilos). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${esc}["']`, 'i');
  const m = html.match(a) ?? html.match(b);
  return m ? decodeEntities(m[1]).trim() : null;
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null;
}

function brandFromName(name: string): string | null {
  const b = detectBrand(normalizeText(name));
  return b ? b.toUpperCase() : null;
}

// ---------- VTEX (Éxito, Euro y otros) ----------

interface VtexOffer {
  Price?: unknown;
  ListPrice?: unknown;
  PriceWithoutDiscount?: unknown;
  AvailableQuantity?: unknown;
  IsAvailable?: unknown;
}
interface VtexSeller {
  sellerName?: unknown;
  commertialOffer?: VtexOffer;
}
interface VtexItem {
  itemId?: unknown;
  name?: unknown;
  nameComplete?: unknown;
  sellers?: VtexSeller[];
}
interface VtexProduct {
  productId?: unknown;
  productName?: unknown;
  brand?: unknown;
  link?: unknown;
  linkText?: unknown;
  items?: VtexItem[];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Acepta la respuesta de /api/catalog_system/pub/products/search (arreglo)
 * o de intelligent-search ({ products: [...] }).
 */
export function parseVtexSearch(json: unknown, baseUrl: string): ProviderProduct[] {
  const list: unknown[] = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null && Array.isArray((json as { products?: unknown }).products)
      ? ((json as { products: unknown[] }).products)
      : [];
  const out: ProviderProduct[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as VtexProduct;
    const productName = str(p.productName);
    if (!productName) continue;
    const brand = str(p.brand);
    const linkText = str(p.linkText);
    let url = str(p.link);
    if (url && url.startsWith('/')) url = baseUrl + url;
    if (!url && linkText) url = `${baseUrl}/${linkText}/p`;
    const items = Array.isArray(p.items) && p.items.length > 0 ? p.items : [{} as VtexItem];
    for (const item of items) {
      const skuName = str(item.nameComplete) ?? str(item.name);
      const name =
        skuName && normalizeText(skuName).includes(normalizeText(productName))
          ? skuName
          : skuName && skuName !== productName && !normalizeText(productName).includes(normalizeText(skuName))
            ? `${productName} ${skuName}`
            : productName;

      const sellerOffers = (Array.isArray(item.sellers) ? item.sellers : []).map((s) => {
        const o = s.commertialOffer ?? {};
        const price = parseCopPrice(o.Price);
        const qty = typeof o.AvailableQuantity === 'number' ? o.AvailableQuantity : null;
        const available = typeof o.IsAvailable === 'boolean' ? o.IsAvailable : qty !== null ? qty > 0 : null;
        const listRaw = parseCopPrice(o.ListPrice) ?? parseCopPrice(o.PriceWithoutDiscount);
        return {
          price,
          list: listRaw !== null && price !== null && listRaw > price ? listRaw : null,
          available,
          seller: str(s.sellerName),
        };
      });
      // Preferencia: disponible con precio (el menor) > con precio > sin precio.
      const byPrice = (a: { price: number | null }, b: { price: number | null }) =>
        (a.price ?? Infinity) - (b.price ?? Infinity);
      const best =
        sellerOffers.filter((x) => x.price !== null && x.available !== false).sort(byPrice)[0] ??
        sellerOffers.filter((x) => x.price !== null).sort(byPrice)[0] ??
        sellerOffers[0] ?? { price: null, list: null, available: null, seller: null };
      out.push({
        externalId: str(item.itemId) ?? str(p.productId),
        name,
        brand,
        price: best.price,
        listPrice: best.list,
        available: best.available,
        url,
        seller: best.seller,
      });
    }
  }
  return out;
}

// ---------- JSON-LD genérico ----------

export function parseJsonLdProducts(html: string, baseUrl: string): ProviderProduct[] {
  const out: ProviderProduct[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (typeof node !== 'object' || node === null) continue;
      const o = node as Record<string, unknown>;
      if (o['@graph']) stack.push(o['@graph']);
      if (o.itemListElement) stack.push(o.itemListElement);
      if (o.item) stack.push(o.item);
      const type = o['@type'];
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      if (!isProduct) continue;
      const name = str(o.name);
      if (!name) continue;
      const brandRaw = o.brand;
      const brand =
        typeof brandRaw === 'string' ? str(brandRaw) : typeof brandRaw === 'object' && brandRaw !== null ? str((brandRaw as Record<string, unknown>).name) : null;
      const offersRaw = Array.isArray(o.offers) ? o.offers[0] : o.offers;
      let price: number | null = null;
      let available: boolean | null = null;
      if (typeof offersRaw === 'object' && offersRaw !== null) {
        const off = offersRaw as Record<string, unknown>;
        price = parseCopPrice(off.price) ?? parseCopPrice(off.lowPrice);
        const av = str(off.availability);
        if (av) available = /InStock|LimitedAvailability|OnlineOnly/i.test(av) ? true : /OutOfStock|SoldOut|Discontinued/i.test(av) ? false : null;
      }
      let url = str(o.url);
      if (url && url.startsWith('/')) url = baseUrl + url;
      out.push({
        externalId: str(o.sku) ?? str(o.productID) ?? null,
        name,
        brand: brand ?? brandFromName(name),
        price,
        listPrice: null,
        available,
        url,
        seller: null,
      });
    }
  }
  return out;
}

// ---------- Euro: página de producto ----------
// Hallazgos verificados en el proyecto: nombre en <title>, precio en el texto
// "Precio con otros medios: $ X", ID en "ID #: N", marca inferida del nombre.

export function parseEuroProductHtml(html: string, url: string): ProviderProduct | null {
  const text = htmlToText(html);
  const title = titleOf(html);
  const name = title ? title.replace(/\s*[-|]\s*Euro Supermercados.*$/i, '').trim() : null;
  if (!name || /p[aá]gina no encontrada|not found|^euro supermercados$/i.test(name)) return null;
  const priceMatch = text.match(/Precio con otros medios:?\s*\$\s*([\d.,]+|-)/i);
  const idMatch = text.match(/ID\s*#:?\s*(\d+)/i);
  // Página 200 sin datos de producto: no se inventa nada.
  if (!priceMatch && !idMatch) return null;
  return {
    externalId: idMatch ? idMatch[1] : null,
    name,
    brand: brandFromName(name),
    price: priceMatch ? parseCopPrice(priceMatch[1]) : null,
    listPrice: null,
    available: null,
    url,
    seller: null,
  };
}

// ---------- Éxito: página de producto ----------
// Hallazgos verificados: expone product:price:amount; marca y PLU en texto
// visible con patrón "DIANA-PLU: 552155"; hay páginas 200 que muestran "$ -".

export function parseExitoProductHtml(html: string, url: string): ProviderProduct | null {
  const text = htmlToText(html);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = h1 ? htmlToText(h1[1]) : (metaContent(html, 'og:title') ?? titleOf(html)?.replace(/\s*[|-]\s*(?:Tiendas\s+)?[EÉ]xito.*$/i, '') ?? null);
  if (!name) return null;
  const pluMatch = text.match(/([A-ZÁÉÍÓÚÑ0-9&' .]{2,40}?)\s*-\s*PLU:?\s*(\d+)/);
  const amount = metaContent(html, 'product:price:amount');
  let price = parseCopPrice(amount);
  // Si la página muestra "$ -" como precio y no hay metadato válido, no hay precio.
  if (price === null && /\$\s*-(?!\d)/.test(text)) price = null;
  const original = parseCopPrice(metaContent(html, 'product:original_price:amount'));
  if (!pluMatch && amount === null && !/\$\s*[\d-]/.test(text)) return null;
  return {
    externalId: pluMatch ? pluMatch[2] : null,
    name,
    brand: pluMatch ? pluMatch[1].trim() : brandFromName(name),
    price,
    listPrice: original !== null && price !== null && original > price ? original : null,
    available: null,
    url,
    seller: null,
  };
}

// ---------- JSON embebido (Next.js / Rappi / D1) ----------

export function extractNextData(html: string): unknown | null {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

const NAME_KEYS = ['name', 'productName', 'product_name', 'title'];
const PRICE_KEYS = ['price', 'salePrice', 'sale_price', 'bestPrice', 'balance_price', 'finalPrice', 'final_price'];
const LIST_KEYS = ['real_price', 'realPrice', 'listPrice', 'list_price', 'original_price', 'originalPrice', 'regularPrice', 'price_before'];
const STORE_KEYS = ['store_name', 'storeName', 'seller_name', 'sellerName'];
const CITY_KEYS = ['city', 'city_name', 'cityName'];

function firstKey(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in o) return o[k];
  return undefined;
}

export interface EmbeddedExtraction {
  products: ProviderProduct[];
  cities: string[];
}

/**
 * Recorre un JSON embebido y extrae objetos con forma de producto
 * (nombre + precio). Se usa para páginas que sirven sus datos como JSON.
 */
export function extractEmbeddedProducts(data: unknown, baseUrl: string, limit = 60): EmbeddedExtraction {
  const products: ProviderProduct[] = [];
  const cities = new Set<string>();
  const seen = new Set<string>();
  const stack: Array<{ node: unknown; store: string | null }> = [{ node: data, store: null }];
  let steps = 0;
  while (stack.length > 0 && steps < 200000) {
    steps++;
    const { node, store } = stack.pop()!;
    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, store });
      continue;
    }
    if (typeof node !== 'object' || node === null) continue;
    const o = node as Record<string, unknown>;

    const cityVal = firstKey(o, CITY_KEYS);
    if (typeof cityVal === 'string' && cityVal.length < 60) cities.add(cityVal);
    if (typeof cityVal === 'object' && cityVal !== null) {
      const cn = str((cityVal as Record<string, unknown>).name);
      if (cn) cities.add(cn);
    }

    let storeHere = str(firstKey(o, STORE_KEYS)) ?? store;
    const storeObj = o.store;
    if (typeof storeObj === 'object' && storeObj !== null) storeHere = str((storeObj as Record<string, unknown>).name) ?? storeHere;

    const name = str(firstKey(o, NAME_KEYS));
    const priceRaw = firstKey(o, PRICE_KEYS);
    if (name && priceRaw !== undefined && name.length >= 3 && name.length <= 200 && products.length < limit) {
      const price = parseCopPrice(priceRaw);
      const list = parseCopPrice(firstKey(o, LIST_KEYS));
      const availRaw = o.is_available ?? o.isAvailable ?? o.in_stock ?? o.inStock ?? o.available;
      const stock = o.stock;
      const available =
        typeof availRaw === 'boolean' ? availRaw : typeof stock === 'number' ? stock > 0 : null;
      const id = str(o.id) ?? (typeof o.id === 'number' ? String(o.id) : null) ?? str(o.sku) ?? str(o.product_id);
      let url = str(o.url) ?? str(o.link) ?? str(o.slug);
      if (url && url.startsWith('/')) url = baseUrl + url;
      else if (url && !/^https?:\/\//.test(url)) url = null;
      const key = `${id ?? ''}|${name}|${price ?? ''}|${storeHere ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        products.push({
          externalId: id,
          name,
          brand: str(o.brand) ?? str(o.trademark) ?? brandFromName(name),
          price,
          listPrice: list !== null && price !== null && list > price ? list : null,
          available,
          url,
          seller: storeHere,
        });
      }
    }
    for (const v of Object.values(o)) {
      if (typeof v === 'object' && v !== null) stack.push({ node: v, store: storeHere });
    }
  }
  return { products, cities: [...cities] };
}

/** Convierte nombres de ciudad encontrados en datos a CityId. */
export function cityIdFromName(name: string): CityId | null {
  const n = normalizeText(name);
  if (/\bmedellin\b|envigado|itagui|sabaneta|bello|la estrella/.test(n)) return 'medellin';
  if (/\bbogota\b/.test(n)) return 'bogota';
  if (/\bcali\b/.test(n)) return 'cali';
  if (/\bbarranquilla\b/.test(n)) return 'barranquilla';
  return null;
}
