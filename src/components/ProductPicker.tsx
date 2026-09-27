'use client';

import { useState } from 'react';
import { productKey } from '@/lib/providers/lookup';
import { parsePresentation, formatSize } from '@/lib/units';
import type { UserSelection } from '@/lib/selection';
import type { Candidate, Offer } from '@/lib/types';
import { Badge, Money } from './ui';

interface Props {
  itemName: string;
  providerName: string;
  offer: Offer;
  /** Clave del producto elegido por el usuario, si lo hay. */
  selectedKey: string | null;
  onPick: (sel: UserSelection | null) => void;
  onClose: () => void;
}

function presentationOf(name: string): string {
  const p = parsePresentation(name);
  const parts = [formatSize(p.size), p.count ? `${p.count} und` : ''].filter(Boolean);
  return parts.join(' · ');
}

const MATCH_TONE = { EXACTO: 'exacto', PROBABLE: 'probable', EQUIVALENTE: 'equivalente', NO_ENCONTRADO: 'no' } as const;
const MATCH_TEXT = {
  EXACTO: 'Exacto',
  PROBABLE: 'Probable',
  EQUIVALENTE: 'Equivalente (otro producto)',
  NO_ENCONTRADO: 'Descartado por el sistema',
} as const;

function CandidateCard({
  c,
  providerName,
  selectable,
  selected,
  onSelect,
}: {
  c: Candidate;
  providerName: string;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const p = c.product;
  const [imgFailed, setImgFailed] = useState(false);
  const priced = p.price !== null && p.price > 0 && p.available !== false;
  const presentation = presentationOf(p.name);
  return (
    <li className={`cand${selected ? ' selected' : ''}`}>
      <div className="cand-img">
        {p.image && !imgFailed ? (
          // Foto publicada por el supermercado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
        ) : (
          <span aria-hidden="true">Sin foto</span>
        )}
      </div>
      <div className="cand-body">
        <Badge tone={MATCH_TONE[c.match]}>{MATCH_TEXT[c.match]}</Badge>
        <strong className="cand-name">{p.name}</strong>
        <span className="muted small">
          {[p.brand, presentation, providerName, p.seller && p.seller !== providerName ? `vende ${p.seller}` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="cand-price num">
          {priced ? (
            <>
              {p.listPrice ? <span className="strike">{`$${p.listPrice.toLocaleString('es-CO')}`}</span> : null}
              <Money value={p.price as number} />
            </>
          ) : (
            <span className="muted small">{p.available === false ? 'Agotado' : 'Sin precio'}</span>
          )}
        </span>
        {c.reasons.length > 0 && <span className="muted small">{c.reasons.join(' ')}</span>}
        {selectable &&
          (selected ? (
            <span className="badge exacto">Seleccionado</span>
          ) : (
            <button className="btn secondary" onClick={onSelect}>
              Seleccionar este producto
            </button>
          ))}
        {p.url && (
          <a className="small" href={p.url} target="_blank" rel="noopener noreferrer">
            Ver en {providerName}
          </a>
        )}
      </div>
    </li>
  );
}

export function ProductPicker({ itemName, providerName, offer, selectedKey, onPick, onClose }: Props) {
  const hasCandidates = offer.candidates.length > 0;
  const [showOthers, setShowOthers] = useState(!hasCandidates);
  const pick = (c: Candidate) => onPick({ kind: 'producto', key: c.key, itemName });
  const nothing = !hasCandidates && offer.others.length === 0 && offer.equivalents.length === 0;
  const userDecided = offer.selection === 'usuario' || offer.selection === 'rechazado';

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="sheet wide" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={(e) => e.stopPropagation()}>
        <p className="muted small" style={{ margin: 0 }}>
          {itemName} · {providerName}
        </p>
        <h2 id="picker-title" style={{ marginTop: 4 }}>
          {nothing
            ? 'No encontramos este producto.'
            : offer.candidates.length > 1
              ? 'Encontramos varias opciones. Selecciona la correcta.'
              : hasCandidates
                ? 'Confirma si este es el producto.'
                : 'No hubo una coincidencia confiable.'}
        </h2>
        {!nothing && (
          <p className="muted small">
            Solo los productos que tú confirmes, o los exactos sin ninguna duda, se suman en la comparación.
          </p>
        )}

        {hasCandidates && (
          <ul className="cand-list">
            {offer.candidates.map((c) => (
              <CandidateCard
                key={c.key}
                c={c}
                providerName={providerName}
                selectable
                selected={selectedKey === c.key || (!userDecided && offer.selection === 'auto' && offer.product !== null && productKey(offer.product) === c.key)}
                onSelect={() => pick(c)}
              />
            ))}
          </ul>
        )}

        {offer.others.length > 0 &&
          (showOthers ? (
            <>
              <h3 style={{ marginTop: 18 }}>Otras opciones</h3>
              <p className="muted small">El sistema las descartó, pero comparten marca o características con lo que pediste.</p>
              <ul className="cand-list">
                {offer.others.map((c) => (
                  <CandidateCard
                    key={c.key}
                    c={c}
                    providerName={providerName}
                    selectable
                    selected={selectedKey === c.key}
                    onSelect={() => pick(c)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShowOthers(true)}>
              Ver otras opciones ({offer.others.length})
            </button>
          ))}

        {offer.equivalents.length > 0 && (
          <details style={{ marginTop: 14 }} open={!hasCandidates && offer.others.length === 0}>
            <summary>
              <strong>Alternativas: otro producto ({offer.equivalents.length})</strong> — no se suman como el mismo producto
            </summary>
            <ul className="cand-list">
              {offer.equivalents.map((c) => (
                <CandidateCard key={c.key} c={c} providerName={providerName} selectable={false} selected={false} onSelect={() => {}} />
              ))}
            </ul>
          </details>
        )}

        <div className="picker-actions">
          {!nothing && (
            <button className="btn danger" onClick={() => onPick({ kind: 'ninguno', itemName })}>
              Ninguno corresponde
            </button>
          )}
          {userDecided && (
            <button className="btn ghost" onClick={() => onPick(null)}>
              Deshacer mi elección
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
