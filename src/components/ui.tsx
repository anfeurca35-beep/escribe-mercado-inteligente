'use client';

import type { ReactNode } from 'react';
import { formatCOP } from '@/lib/format';
import type { MatchStatus, Offer, ProviderId } from '@/lib/types';

export function Money({ value }: { value: number }) {
  return <span className="num">{formatCOP(value)}</span>;
}

type Tone = 'exacto' | 'probable' | 'equivalente' | 'no' | 'gris';

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const MATCH_LABEL: Record<MatchStatus, { tone: Tone; label: string }> = {
  EXACTO: { tone: 'exacto', label: 'Exacto' },
  PROBABLE: { tone: 'probable', label: 'Probable' },
  EQUIVALENTE: { tone: 'equivalente', label: 'Equivalente' },
  NO_ENCONTRADO: { tone: 'no', label: 'No encontrado' },
};

export function OfferBadge({ offer }: { offer: Offer }) {
  switch (offer.status) {
    case 'PENDIENTE_INTEGRACION':
      return <Badge tone="gris">Pendiente de integración</Badge>;
    case 'PROVEEDOR_NO_DISPONIBLE':
      return <Badge tone="gris">Proveedor no disponible</Badge>;
    case 'NO_ENCONTRADO':
      return <Badge tone="no">No encontrado</Badge>;
    case 'SIN_PRECIO': {
      const m = MATCH_LABEL[offer.match];
      return <Badge tone="gris">{`${m.label} · sin precio`}</Badge>;
    }
    case 'OK': {
      if (offer.selection === 'usuario') return <Badge tone="exacto">Confirmado por ti</Badge>;
      if (offer.selection === 'rechazado') return <Badge tone="gris">Ninguno corresponde</Badge>;
      if (offer.selection === 'pendiente') return <Badge tone="probable">Por confirmar</Badge>;
      const m = MATCH_LABEL[offer.match];
      return <Badge tone={m.tone}>{m.label}</Badge>;
    }
  }
}

export function Legend() {
  return (
    <div className="legend small">
      <Badge tone="exacto">Exacto o confirmado por ti: se suma en la comparación</Badge>
      <Badge tone="probable">Por confirmar: elige el producto correcto</Badge>
      <Badge tone="equivalente">Equivalente: otro producto que podría servir</Badge>
      <Badge tone="no">No encontrado</Badge>
      <Badge tone="gris">Sin precio, no disponible o pendiente</Badge>
    </div>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#1d6a44" />
      <path d="M9 12h14l-1.6 9.2a2 2 0 0 1-2 1.8h-6.8a2 2 0 0 1-2-1.8z" fill="#f5f7f1" />
      <path d="M12.5 12c0-2.4 1.6-4 3.5-4s3.5 1.6 3.5 4" fill="none" stroke="#f5f7f1" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="17.5" r="2.2" fill="#f4b000" />
    </svg>
  );
}

/** Insignia propia de cada supermercado (iniciales y color fijo; no son sus logos). */
const PROVIDER_MARK: Record<ProviderId, { abbr: string; color: string }> = {
  exito: { abbr: 'ÉX', color: '#1f6f78' },
  d1: { abbr: 'D1', color: '#6b4fa0' },
  euro: { abbr: 'EU', color: '#2a5fa8' },
  rappi: { abbr: 'RA', color: '#5b6470' },
  ara: { abbr: 'AR', color: '#8a5a2b' },
  vaquita: { abbr: 'LV', color: '#5f6f1f' },
};

export function ProviderMark({ id, size = 'm' }: { id: ProviderId; size?: 's' | 'm' }) {
  const m = PROVIDER_MARK[id];
  return (
    <span className={`pmark pmark-${size}`} style={{ background: m.color }} aria-hidden="true">
      {m.abbr}
    </span>
  );
}

export function ProviderName({ id, name, size = 'm' }: { id: ProviderId; name: string; size?: 's' | 'm' }) {
  return (
    <span className="pname">
      <ProviderMark id={id} size={size} />
      <span>{name}</span>
    </span>
  );
}
