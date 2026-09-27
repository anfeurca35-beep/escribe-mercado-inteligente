// Información pública de cada proveedor (sin código de red).
// Se puede importar desde el navegador.

import type { ProviderId, ProviderInfo } from '../types';

export const PROVIDER_ORDER: ProviderId[] = ['exito', 'vaquita', 'd1', 'ara', 'euro', 'rappi'];

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  exito: {
    id: 'exito',
    name: 'Éxito',
    integration: 'activo',
    pendingReason: null,
    cities: 'todas',
    marketplace: false,
    limitation: 'Precio de la tienda en línea; puede variar en tienda física.',
  },
  vaquita: {
    id: 'vaquita',
    name: 'La Vaquita',
    integration: 'pendiente',
    pendingReason: 'Pendiente de integración: el sitio no dio una respuesta verificable y estable.',
    cities: ['medellin'],
    marketplace: false,
    limitation: 'Sin acceso verificable; no se muestran precios.',
  },
  d1: {
    id: 'd1',
    name: 'D1',
    integration: 'activo',
    pendingReason: null,
    cities: 'todas',
    marketplace: false,
    limitation: 'Precio de domicilios.tiendasd1.com.',
  },
  ara: {
    id: 'ara',
    name: 'Ara',
    integration: 'pendiente',
    pendingReason: 'Pendiente de integración: el sitio bloquea las consultas (HTTP 403) y no se evade ese bloqueo.',
    cities: 'todas',
    marketplace: false,
    limitation: 'El sitio responde 403; no se hace bypass.',
  },
  euro: {
    id: 'euro',
    name: 'Euro',
    integration: 'activo',
    pendingReason: null,
    cities: ['medellin', 'barranquilla'],
    marketplace: false,
    limitation: 'Opera en el área de Medellín, Barranquilla y Montería.',
  },
  rappi: {
    id: 'rappi',
    name: 'Rappi',
    integration: 'parcial',
    pendingReason: null,
    cities: 'todas',
    marketplace: true,
    limitation:
      'Marketplace: el precio depende de la tienda y la ciudad, y no se conocen domicilio ni cargos. Se muestra aparte y no entra en totales.',
  },
};
