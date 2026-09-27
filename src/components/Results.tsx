'use client';

import { useMemo } from 'react';
import { compareList, type ComparisonResult, type ProviderCoverage } from '@/lib/comparison';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cityName } from '@/lib/location';
import { listSignature, type ShoppingList } from '@/lib/storage';
import type { CityId, ListItem, Offer, ProviderId, ProviderInfo } from '@/lib/types';
import { Badge, Legend, Money, OfferBadge } from './ui';

export type ProgressState = { state: 'loading' } | { state: 'done' } | { state: 'error'; message: string };

interface Props {
  list: ShoppingList;
  providers: ProviderInfo[];
  city: CityId;
  progress: Partial<Record<ProviderId, ProgressState>>;
  busy: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onChangeCity: () => void;
}

function pct(n: number): string {
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

function Recommendation({ c, requested }: { c: ComparisonResult; requested: number }) {
  const single = c.singleStoreOptions[0];
  if (single) {
    return (
      <div className="verdict">
        <p className="headline" style={{ margin: 0 }}>
          Puedes comprar toda la lista en {single.name}
        </p>
        <p className="big num" style={{ margin: '6px 0 0' }}>
          <Money value={single.total} />
        </p>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          {requested} de {requested} productos exactos, con las cantidades de tu lista.
        </p>
        {c.singleStoreOptions.length > 1 && (
          <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {c.singleStoreOptions.slice(1).map((o) => (
              <li key={o.providerId}>
                También completo en {o.name}: <Money value={o.total} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const b = c.bestCoverage;
  return (
    <div className="verdict">
      <p className="headline" style={{ margin: 0 }}>
        Ningún supermercado tiene toda la lista disponible.
      </p>
      {b ? (
        <>
          <p style={{ margin: '12px 0 0' }}>
            <strong>Mejor cobertura:</strong> {b.name} — {b.exact}/{b.requested} productos ({pct(b.coveragePct)})
          </p>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Esos {b.exact} productos exactos suman <Money value={b.exactSubtotal} />.
          </p>
          <CountList c={b} />
        </>
      ) : (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Todavía no hay productos exactos confirmados con precio. Revisa abajo los probables y equivalentes, o escribe marca y tamaño en la
          lista.
        </p>
      )}
    </div>
  );
}

function CountList({ c }: { c: ProviderCoverage }) {
  return (
    <ul className="counts num">
      <li>Solicitados: {c.requested}</li>
      <li>Encontrados: {c.found}</li>
      <li>
        <Badge tone="exacto">Exactos: {c.exact}</Badge>
      </li>
      <li>
        <Badge tone="probable">Probables: {c.probable}</Badge>
      </li>
      <li>
        <Badge tone="equivalente">Equivalentes: {c.equivalent}</Badge>
      </li>
      <li>Sin precio: {c.noPrice}</li>
      <li>No encontrados: {c.notFound}</li>
    </ul>
  );
}

function MaxSavings({ c, requested }: { c: ComparisonResult; requested: number }) {
  const plan = c.maxSavings;
  if (plan.itemsCovered === 0) {
    return (
      <p className="notice muted">
        Aún no se puede calcular: ningún producto tiene un precio exacto confirmado en un supermercado.
      </p>
    );
  }
  const complete = c.maxSavings.comparisons.filter((x) => x.coversWholePlan);
  const partial = c.maxSavings.comparisons.filter((x) => !x.coversWholePlan);
  return (
    <>
      <div className="ticket">
        <p className="muted small" style={{ margin: 0 }}>
          Comprando cada producto donde está más barato ({plan.byProvider.length} {plan.byProvider.length === 1 ? 'supermercado' : 'supermercados'}
          ): {plan.itemsCovered} de {requested} productos.
        </p>
        {plan.byProvider.map((g) => (
          <div className="store" key={g.providerId}>
            <h3>
              <span>{g.name}</span>
              <Money value={g.subtotal} />
            </h3>
            {g.lines.map((l) => (
              <div className="line" key={l.itemId}>
                <span>
                  {l.quantity} × {l.itemName}
                </span>
                <span className="num">
                  <Money value={l.lineTotal} />
                </span>
                <span className="detail">
                  {l.productName} · {l.listPrice ? <span className="strike num">{`$${l.listPrice.toLocaleString('es-CO')}`}</span> : null}
                  <Money value={l.unitPrice} /> c/u
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="total">
          <span>Total</span>
          <span className="amount num">
            <Money value={plan.total} />
          </span>
        </div>
      </div>

      {complete.length > 0 && (
        <ul className="small" style={{ paddingLeft: 18 }}>
          {complete.map((x) => (
            <li key={x.providerId}>
              Frente a comprar esos mismos {x.itemsCompared} productos solo en {x.name} (<Money value={x.providerCost} />):{' '}
              {x.savings > 0 ? (
                <strong>
                  ahorras <Money value={x.savings} />
                </strong>
              ) : (
                'mismo precio'
              )}
              .
            </li>
          ))}
        </ul>
      )}
      {partial.length > 0 && (
        <details className="small">
          <summary>Comparación con supermercados que tienen solo parte de estos productos</summary>
          <ul style={{ paddingLeft: 18 }}>
            {partial.map((x) => (
              <li key={x.providerId}>
                {x.name} tiene {x.itemsCompared} de estos productos: <Money value={x.providerCost} /> frente a <Money value={x.planCost} /> en el
                plan ({x.savings > 0 ? <>ahorras <Money value={x.savings} /></> : 'sin diferencia'}).
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.missing.length > 0 && (
        <div className="notice warn small" style={{ marginTop: 10 }}>
          <strong>Sin precio exacto confirmado ({plan.missing.length}):</strong> no están incluidos en el total.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {plan.missing.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function CoverageTable({ coverage, providers }: { coverage: ProviderCoverage[]; providers: ProviderInfo[] }) {
  const info = new Map(providers.map((p) => [p.id, p]));
  return (
    <div className="table-wrap">
      <table className="coverage num">
        <thead>
          <tr>
            <th scope="col">Supermercado</th>
            <th scope="col">Cobertura</th>
            <th scope="col">Encontrados</th>
            <th scope="col">Exactos</th>
            <th scope="col">Probables</th>
            <th scope="col">Equivalentes</th>
            <th scope="col">Sin precio</th>
            <th scope="col">No encontrados</th>
            <th scope="col">No disponible</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((c) => {
            const p = info.get(c.providerId);
            const pending = c.pending > 0 && c.pending === c.requested;
            return (
              <tr key={c.providerId}>
                <th scope="row">
                  {c.name}
                  <br />
                  <span className="muted small" style={{ fontWeight: 400 }}>
                    {c.waiting
                      ? 'Consultando…'
                      : pending
                        ? 'Pendiente de integración'
                        : p?.marketplace
                          ? 'Aparte (marketplace)'
                          : c.unavailable === c.requested && c.requested > 0
                            ? 'No disponible'
                            : 'Activo'}
                  </span>
                </th>
                {pending ? (
                  <td colSpan={8} className="muted" style={{ textAlign: 'left' }}>
                    Sin datos: {p?.pendingReason ?? 'pendiente de integración.'}
                  </td>
                ) : (
                  <>
                    <td>
                      {c.exact}/{c.requested} ({pct(c.coveragePct)})
                    </td>
                    <td>{c.found}</td>
                    <td>{c.exact}</td>
                    <td>{c.probable}</td>
                    <td>{c.equivalent}</td>
                    <td>{c.noPrice}</td>
                    <td>{c.notFound}</td>
                    <td>{c.unavailable}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OfferRow({ offer, providerName }: { offer: Offer; providerName: string }) {
  const p = offer.product;
  const showPrice = offer.status === 'OK' && p?.price != null;
  const aside = offer.status === 'OK' && !offer.includedInTotals && offer.match === 'EXACTO';
  return (
    <div className={`offer-row${aside ? ' aside' : ''}`}>
      <span className="prov">{providerName}</span>
      <div className="body">
        <OfferBadge offer={offer} />
        {p && (
          <span className="found small">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.name}
              </a>
            ) : (
              p.name
            )}
            {p.seller ? ` · vendido por ${p.seller}` : ''}
          </span>
        )}
      </div>
      <span className="price num">
        {showPrice && p ? (
          <>
            {p.listPrice ? <span className="strike">{`$${p.listPrice.toLocaleString('es-CO')}`}</span> : null}
            <Money value={p.price as number} />
            {p.listPrice ? <span className="small" style={{ display: 'block', fontWeight: 400 }}>Promoción</span> : null}
          </>
        ) : (
          <span className="muted small">—</span>
        )}
      </span>
      {(offer.note || offer.matchReasons.length > 0 || aside) && (
        <span className="reasons">
          {aside && <strong>No se suma en totales. </strong>}
          {aside ? offer.exclusionReason : null}
          {!aside && offer.status === 'OK' ? offer.matchReasons.join(' ') : null}
          {offer.status !== 'OK' ? offer.note : null}
        </span>
      )}
      {offer.equivalents.length > 0 && (
        <details>
          <summary>Equivalentes ({offer.equivalents.length}) — no se suman</summary>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {offer.equivalents.map((e, i) => (
              <li key={`${e.name}-${i}`}>
                {e.name}: {e.price != null && e.available !== false ? <Money value={e.price} /> : 'sin precio'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProductDetail({ item, offers, providers }: { item: ListItem; offers: Offer[]; providers: ProviderInfo[] }) {
  const own = providers.map((p) => ({ p, o: offers.find((x) => x.itemId === item.id && x.providerId === p.id) }));
  return (
    <article className="product">
      <header>
        <strong>{item.name}</strong>
        <span className="num">Cantidad: {item.quantity}</span>
      </header>
      {own.map(({ p, o }) =>
        o ? (
          <OfferRow key={p.id} offer={o} providerName={p.name} />
        ) : (
          <div className="offer-row" key={p.id}>
            <span className="prov">{p.name}</span>
            <span className="muted small">Sin consultar todavía.</span>
            <span />
          </div>
        ),
      )}
    </article>
  );
}

function AsideSection({ offers, items, providers }: { offers: Offer[]; items: ListItem[]; providers: ProviderInfo[] }) {
  if (offers.length === 0) return null;
  const qty = new Map(items.map((i) => [i.id, i.quantity]));
  const names = new Map(items.map((i) => [i.id, i.name]));
  const byProvider = new Map<ProviderId, Offer[]>();
  for (const o of offers) byProvider.set(o.providerId, [...(byProvider.get(o.providerId) ?? []), o]);
  return (
    <section className="section">
      <h2>Precios mostrados aparte</h2>
      {[...byProvider.entries()].map(([pid, list]) => {
        const info = providers.find((p) => p.id === pid);
        const subtotal = list.reduce((s, o) => s + (o.product?.price ?? 0) * (qty.get(o.itemId) ?? 1), 0);
        return (
          <div className="notice" key={pid} style={{ marginBottom: 10 }}>
            <h3>{info?.name ?? pid}</h3>
            <p className="small muted">{list[0].exclusionReason}</p>
            <ul className="small" style={{ paddingLeft: 18 }}>
              {list.map((o) => (
                <li key={o.itemId}>
                  {qty.get(o.itemId)} × {names.get(o.itemId)}: <Money value={o.product?.price ?? 0} /> c/u
                  {o.product?.seller ? ` (${o.product.seller})` : ' (tienda no confirmada)'}
                </li>
              ))}
            </ul>
            <p className="small" style={{ margin: 0 }}>
              <strong>Subtotal de productos:</strong> <Money value={subtotal} />. No incluye domicilio, servicio ni otros cargos, así que no se
              compara con los demás supermercados.
            </p>
          </div>
        );
      })}
    </section>
  );
}

export function Results({ list, providers, city, progress, busy, onRefresh, onEdit, onChangeCity }: Props) {
  const responses = list.results?.responses ?? [];
  const offers = useMemo(() => responses.flatMap((r) => r.offers), [responses]);
  const answered = useMemo(() => new Set(responses.map((r) => r.providerId)), [responses]);
  const comparison = useMemo(() => compareList(list.items, offers, providers, answered), [list.items, offers, providers, answered]);

  const times = responses.map((r) => r.fetchedAt).sort();
  const oldest = times[0];
  const cityChanged = list.results && list.results.city !== city;
  const listChanged = list.results && list.results.signature !== listSignature(list.items);
  const nameOf = new Map(providers.map((p) => [p.id, p.name]));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="btn ghost" onClick={onEdit}>
          ‹ Editar lista
        </button>
        <button className="btn secondary" onClick={onRefresh} disabled={busy}>
          {busy ? 'Consultando…' : 'Actualizar precios'}
        </button>
      </div>

      <h1 style={{ marginTop: 10 }}>{list.name || 'Mi lista'}</h1>
      <p className="lede">
        {list.items.length} productos · {cityName(city)}{' '}
        <button className="link-btn" onClick={onChangeCity}>
          cambiar
        </button>
        <br />
        {oldest ? (
          <span className="small">
            Precios consultados el {formatDateTime(oldest)} ({formatRelative(oldest)}). No son precios en tiempo real.
          </span>
        ) : (
          <span className="small">Aún no hay precios consultados.</span>
        )}
      </p>

      <div className="progress" aria-live="polite">
        {providers.map((p) => {
          const st = progress[p.id];
          if (!st) return null;
          const label = st.state === 'loading' ? 'consultando…' : st.state === 'done' ? 'listo' : 'error';
          return (
            <span key={p.id} className={st.state}>
              {p.name}: {label}
            </span>
          );
        })}
      </div>

      {(cityChanged || listChanged) && (
        <p className="notice warn small" style={{ marginTop: 14 }}>
          {cityChanged ? `Estos precios son de ${cityName(list.results!.city)}. ` : ''}
          {listChanged ? 'La lista cambió desde la última consulta. ' : ''}
          Toca «Actualizar precios» para consultar de nuevo.
        </p>
      )}

      <section className="section">
        <h2>Recomendación</h2>
        <Recommendation c={comparison} requested={list.items.length} />
      </section>

      <section className="section">
        <h2>Máximo ahorro</h2>
        <MaxSavings c={comparison} requested={list.items.length} />
      </section>

      <section className="section">
        <h2>Cobertura por supermercado</h2>
        <CoverageTable coverage={comparison.coverage} providers={providers} />
        <p className="muted small">Solo los productos exactos con precio confirmado cuentan para la cobertura y los totales.</p>
      </section>

      <AsideSection offers={comparison.excludedOffers} items={list.items} providers={providers} />

      <section className="section">
        <h2>Producto por producto</h2>
        <Legend />
        <div style={{ marginTop: 12 }}>
          {list.items.map((it) => (
            <ProductDetail key={it.id} item={it} offers={offers} providers={providers} />
          ))}
        </div>
        {!busy && responses.length > 0 && (
          <p className="muted small">
            Precios leídos de las páginas públicas de cada supermercado. {nameOf.get('rappi') ?? 'Rappi'} y los productos probables o
            equivalentes nunca se suman en los totales.
          </p>
        )}
      </section>
    </>
  );
}
