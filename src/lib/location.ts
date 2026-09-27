// Ciudades soportadas y ubicación aproximada.
// Solo se guarda la ciudad; nunca las coordenadas.

import type { CityId } from './types';

export interface City {
  id: CityId;
  name: string;
  short: string;
  lat: number;
  lng: number;
  /** Radio en km que se considera parte del área (p. ej. Valle de Aburrá). */
  radiusKm: number;
}

export const CITIES: City[] = [
  { id: 'medellin', name: 'Medellín y Valle de Aburrá', short: 'Medellín', lat: 6.2442, lng: -75.5812, radiusKm: 45 },
  { id: 'bogota', name: 'Bogotá', short: 'Bogotá', lat: 4.711, lng: -74.0721, radiusKm: 45 },
  { id: 'cali', name: 'Cali', short: 'Cali', lat: 3.4516, lng: -76.532, radiusKm: 35 },
  { id: 'barranquilla', name: 'Barranquilla', short: 'Barranquilla', lat: 10.9685, lng: -74.7813, radiusKm: 35 },
];

export const CITY_IDS = CITIES.map((c) => c.id);

export function isCityId(value: unknown): value is CityId {
  return typeof value === 'string' && (CITY_IDS as string[]).includes(value);
}

export function cityName(id: CityId): string {
  return CITIES.find((c) => c.id === id)?.name ?? id;
}

export function cityShortName(id: CityId): string {
  return CITIES.find((c) => c.id === id)?.short ?? id;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Devuelve la ciudad soportada más cercana dentro de su radio, o null. */
export function cityFromCoords(lat: number, lng: number): CityId | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { id: CityId; d: number } | null = null;
  for (const c of CITIES) {
    const d = distanceKm(lat, lng, c.lat, c.lng);
    if (d <= c.radiusKm && (!best || d < best.d)) best = { id: c.id, d };
  }
  return best?.id ?? null;
}
