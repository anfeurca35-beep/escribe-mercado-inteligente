'use client';

import type { ReactNode } from 'react';
import { formatCOP } from '@/lib/format';
import type { MatchStatus, Offer } from '@/lib/types';

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
      const m = MATCH_LABEL[offer.match];
      return <Badge tone={m.tone}>{m.label}</Badge>;
    }
  }
}

export function Legend() {
  return (
    <div className="legend small">
      <Badge tone="exacto">Exacto: mismo producto, marca, variante y tamaño</Badge>
      <Badge tone="probable">Probable: falta verificar algún dato</Badge>
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
