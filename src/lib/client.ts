// Llamadas del navegador a la API propia.

import type { CityId, ListItem, ProviderId, ProviderInfo, ProviderPricesResponse } from './types';

export interface ProvidersPayload {
  providers: ProviderInfo[];
  features: { photoImport: boolean };
}

export async function fetchProviders(): Promise<ProvidersPayload> {
  const res = await fetch('/api/providers', { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar la lista de supermercados.');
  return (await res.json()) as ProvidersPayload;
}

export async function fetchPrices(providerId: ProviderId, city: CityId, items: ListItem[]): Promise<ProviderPricesResponse> {
  const res = await fetch('/api/prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providerId, city, items: items.map(({ id, name, quantity }) => ({ id, name, quantity })) }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<ProviderPricesResponse> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'No se pudo consultar este supermercado.');
  return json as ProviderPricesResponse;
}

export async function readListFromPhoto(file: File): Promise<{ items: Array<{ name: string; quantity: number }>; message?: string }> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType: file.type, data }),
  });
  const json = (await res.json().catch(() => ({}))) as { items?: Array<{ name: string; quantity: number }>; message?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'No se pudo leer la foto.');
  return { items: json.items ?? [], message: json.message };
}
