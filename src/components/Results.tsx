'use client';

import { useMemo, useState } from 'react';
import { compareList, type ComparisonResult, type ProviderCoverage } from '@/lib/comparison';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cityName } from '@/lib/location';
import { applySelections, selectionFor, type UserSelection } from '@/lib/selection';
import { listSignature, refinementFor, type ShoppingList } from '@/lib/storage';
import type { CityId, ListItem, Offer, ProviderId, ProviderInfo } from '@/lib/types';
import { ProductPicker } from './ProductPicker';
import { Badge, Legend, Money, OfferBadge, ProviderName } from './ui';

export type ProgressState = { state: 'loading' } | { state: 'done' } | { state: 'error'; message: string };

/** Búsqueda del mismo producto en los demás supermercados tras una confirmación. */
export interface CrossSearch {
  listId: string;
  itemId: string;
  /** Texto buscado; null = se volvió a buscar lo que escribió el usuario. */
  text: string | null;
  fromProvider: ProviderId;
  /** 'eleccion' = el usuario eligió un producto; 'deshacer' = deshizo o rechazó. */
  reason: 'eleccion' | 'deshacer';
  status: Partial<Record<ProviderId, 'loading' | 'done' | 'error'>>;
}

interface Props {
  list: ShoppingList;
  providers: ProviderInfo[];
  city: CityId;
  progress: Partial<Record<ProviderId, ProgressState>>;
  busy: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onChangeCity: () => void;
  onSelect: (itemId: string, providerId: ProviderId, sel: UserSelection | null) => void;
  cross: CrossSearch | null;
  onDismissCross: () => void;
}

type OpenPicker = (itemId: string, providerId: ProviderId) => void;

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
          {requested} de {requested} productos exactos o confirmados por ti, con las cantidades de tu lista.
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
            <strong>Mejor cobertura:</strong> {b.name} — {b.usable}/{b.requested} productos ({pct(b.coveragePct)})
          </p>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Esos {b.usable} productos (exactos o confirmados) suman <Money value={b.exactSubtotal} />.
          </p>
          <CountList c={b} />
        </>
      ) : (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Todavía no hay productos exactos o confirmados con precio. Confirma abajo los productos pendientes, o escribe marca y tamaño en
          la lista.
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
        <Badge tone="exacto">Confirmados por ti: {c.confirmed}</Badge>
      </li>
      <li>
        <Badge tone="probable">Por confirmar: {c.toConfirm}</Badge>
      </li>
      <li>
        <Badge tone="equivalente">Equivalentes: {c.equivalent}</Badge>
      </li>
      <li>Sin precio: {c.noPrice}</li>
      <li>No encontrados: {c.notFound + c.rejected}</li>
    </ul>
  );
}

function MaxSavings({ c, requested }: { c: ComparisonResult; requested: number }) {
  const plan = c.maxSavings;
  if (plan.itemsCovered === 0) {
    return (
      <p className="notice muted">
        Aún no se puede calcular: ningún producto tiene un precio exacto o confirmado por ti en un supermercado.
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
              <ProviderName id={g.providerId} name={g.name} />
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
                  {l.confirmedByUser ? '✓ Confirmado por ti · ' : ''}
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
          <strong>Sin precio exacto o confirmado ({plan.missing.length}):</strong> no están incluidos en el total. Si alguno aparece
          como «por confirmar», elige el producto correcto abajo.
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
            <th scope="col">Confirmados</th>
            <th scope="col">Por confirmar</th>
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
                  <ProviderName id={c.providerId} name={c.name} size="s" />
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
                  <td colSpan={9} className="muted" style={{ textAlign: 'left' }}>
                    Sin datos: {p?.pendingReason ?? 'pendiente de integración.'}
                  </td>
                ) : (
                  <>
                    <td>
                      {c.usable}/{c.requested} ({pct(c.coveragePct)})
                    </td>
                    <td>{c.found}</td>
                    <td>{c.exact}</td>
                    <td>{c.confirmed}</td>
                    <td>{c.toConfirm}</td>
                    <td>{c.equivalent}</td>
                    <td>{c.noPrice}</td>
                    <td>{c.notFound + c.rejected}</td>
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

function OfferActions({ offer, onOpen }: { offer: Offer; onOpen: () => void }) {
  const total = offer.candidates.length + offer.others.length;
  if (offer.status === 'PENDIENTE_INTEGRACION' || offer.status === 'PROVEEDOR_NO_DISPONIBLE') return null;
  let label: string | null = null;
  let primary = false;
  if (offer.selection === 'pendiente') {
    label = offer.candidates.length > 1 ? `Elegir producto (${offer.candidates.length} opciones)` : 'Confirmar producto';
    primary = true;
  } else if (offer.selection === 'usuario' || offer.selection === 'rechazado' || offer.selection === 'auto') {
    label = 'Cambiar';
  } else if (offer.others.length > 0) {
    label = `Ver otras opciones (${offer.others.length})`;
  } else if (offer.equivalents.length > 0) {
    label = `Ver alternativas (${offer.equivalents.length})`;
  }
  if (!label || (label === 'Cambiar' && total === 0 && offer.selection === 'auto')) return null;
  return (
    <span className="offer-actions">
      <button className={primary ? 'btn' : 'link-btn'} onClick={onOpen}>
        {label}
      </button>
    </span>
  );
}

function OfferRow({ offer, providerName, onOpen }: { offer: Offer; providerName: string; onOpen: () => void }) {
  const providerLabel = <ProviderName id={offer.providerId} name={providerName} />;
  const p = offer.product;
  const decided = offer.selection === 'auto' || offer.selection === 'usuario';
  const showPrice = offer.status === 'OK' && p?.price != null && offer.selection !== 'rechazado';
  const aside = offer.status === 'OK' && decided && !offer.includedInTotals && !offer.eligible;
  const pending = offer.selection === 'pendiente';
  return (
    <div className={`offer-row${aside ? ' aside' : ''}${pending ? ' pending' : ''}`}>
      <span className="prov">{providerLabel}</span>
      <div className="body">
        <OfferBadge offer={offer} />
        {p && offer.selection !== 'rechazado' && (
          <span className="found small">
            {pending ? 'Sugerido: ' : ''}
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
          {!aside && offer.status === 'OK' && offer.selection !== 'rechazado' ? offer.matchReasons.join(' ') : null}
          {offer.status !== 'OK' || offer.selection === 'rechazado' ? offer.note : null}
          {pending && offer.status === 'OK' ? ' No se suma hasta que lo confirmes.' : null}
        </span>
      )}
      <OfferActions offer={offer} onOpen={onOpen} />
    </div>
  );
}

function ProductDetail({
  item,
  offers,
  providers,
  onOpen,
  refinedText,
  refinedFrom,
}: {
  item: ListItem;
  offers: Offer[];
  providers: ProviderInfo[];
  onOpen: OpenPicker;
  refinedText: string | null;
  refinedFrom: string | null;
}) {
  const own = providers.map((p) => ({ p, o: offers.find((x) => x.itemId === item.id && x.providerId === p.id) }));
  return (
    <article className="product" id={`item-${item.id}`}>
      <header>
        <strong>{item.name}</strong>
        <span className="num">Cantidad: {item.quantity}</span>
      </header>
      {refinedText && (
        <p className="refined small">
          Se busca en los demás supermercados como <strong>«{refinedText}»</strong>, según tu elección en {refinedFrom}.
        </p>
      )}
      {own.map(({ p, o }) =>
        o ? (
          <OfferRow key={p.id} offer={o} providerName={p.name} onOpen={() => onOpen(item.id, p.id)} />
        ) : (
          <div className="offer-row" key={p.id}>
            <span className="prov">
              <ProviderName id={p.id} name={p.name} />
            </span>
            <span className="muted small">Sin consultar todavía.</span>
            <span />
          </div>
        ),
      )}
    </article>
  );
}

function crossOutcome(o: Offer | undefined): string {
  if (!o) return 'sin respuesta';
  if (o.status === 'PROVEEDOR_NO_DISPONIBLE') return 'no disponible';
  if (o.status === 'NO_ENCONTRADO') return 'no lo encontramos';
  if (o.selection === 'auto' && o.status === 'OK' && o.product?.price != null) {
    return `encontrado: ${o.product.name} · $${o.product.price.toLocaleString('es-CO')}${o.eligible ? '' : ' (aparte)'}`;
  }
  if (o.selection === 'pendiente') return `${o.candidates.length} ${o.candidates.length === 1 ? 'opción' : 'opciones'} por confirmar`;
  if (o.equivalents.length > 0) return 'solo productos equivalentes';
  if (o.status === 'SIN_PRECIO') return 'encontrado, sin precio';
  return 'no lo encontramos';
}

function CrossNotice({
  cross,
  offers,
  items,
  providers,
  onOpen,
  onDismiss,
}: {
  cross: CrossSearch;
  offers: Offer[];
  items: ListItem[];
  providers: ProviderInfo[];
  onOpen: OpenPicker;
  onDismiss: () => void;
}) {
  const item = items.find((i) => i.id === cross.itemId);
  if (!item) return null;
  const pname = new Map(providers.map((p) => [p.id, p.name]));
  const entries = Object.entries(cross.status) as Array<[ProviderId, 'loading' | 'done' | 'error']>;
  const loading = entries.some(([, st]) => st === 'loading');
  return (
    <section className="notice cross" style={{ marginTop: 18 }} aria-live="polite">
      <h2 style={{ fontSize: '1.05rem' }}>
        {loading ? 'Buscando el mismo producto en los demás supermercados…' : 'Buscamos el mismo producto en los demás supermercados'}
      </h2>
      <p className="small" style={{ margin: '4px 0 8px' }}>
        {cross.text ? (
          <>
            Según tu elección en {pname.get(cross.fromProvider)}, buscamos: <strong>«{cross.text}»</strong>
          </>
        ) : cross.reason === 'eleccion' ? (
          <>
            El producto que elegiste en {pname.get(cross.fromProvider)} coincide con lo que escribiste; buscamos:{' '}
            <strong>«{item.name}»</strong>
          </>
        ) : (
          <>
            Volvimos a buscar lo que escribiste: <strong>«{item.name}»</strong>
          </>
        )}
      </p>
      <ul className="cross-list small">
        {entries.map(([pid, st]) => {
          const o = offers.find((x) => x.itemId === cross.itemId && x.providerId === pid);
          return (
            <li key={pid}>
              <ProviderName id={pid} name={pname.get(pid) ?? pid} size="s" />
              <span>
                {st === 'loading' ? 'buscando…' : st === 'error' ? 'no se pudo consultar' : crossOutcome(o)}
              </span>
              {st === 'done' && o && o.selection === 'pendiente' && (
                <button className="link-btn" onClick={() => onOpen(cross.itemId, pid)}>
                  Elegir
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!loading && entries.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          En los demás supermercados ya decidiste qué producto es. Toca «Cambiar» en cada uno si quieres volver a buscarlo.
        </p>
      )}
      {!loading && (
        <button className="link-btn small" style={{ marginTop: 8 }} onClick={onDismiss}>
          Cerrar aviso
        </button>
      )}
    </section>
  );
}

function PendingBanner({
  offers,
  items,
  providers,
  onOpen,
}: {
  offers: Offer[];
  items: ListItem[];
  providers: ProviderInfo[];
  onOpen: OpenPicker;
}) {
  const pending = offers.filter((o) => o.selection === 'pendiente');
  if (pending.length === 0) return null;
  const names = new Map(items.map((i) => [i.id, i.name]));
  const pname = new Map(providers.map((p) => [p.id, p.name]));
  return (
    <section className="notice warn" style={{ marginTop: 18 }} aria-live="polite">
      <h2 style={{ fontSize: '1.1rem' }}>
        {pending.length === 1 ? '1 producto necesita tu confirmación' : `${pending.length} productos necesitan tu confirmación`}
      </h2>
      <p className="small" style={{ margin: '6px 0 10px' }}>
        El sistema encontró opciones parecidas, pero no puede asegurar que sean lo que buscas. Confírmalas para que entren en la
        comparación.
      </p>
      <div className="pending-list">
        {pending.map((o) => (
          <button key={`${o.itemId}-${o.providerId}`} className="btn secondary" onClick={() => onOpen(o.itemId, o.providerId)}>
            <ProviderName id={o.providerId} name={`${names.get(o.itemId)} · ${pname.get(o.providerId)}`} size="s" />
          </button>
        ))}
      </div>
    </section>
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

export function Results({
  list,
  providers,
  city,
  progress,
  busy,
  onRefresh,
  onEdit,
  onChangeCity,
  onSelect,
  cross,
  onDismissCross,
}: Props) {
  const responses = list.results?.responses ?? [];
  const itemNames = useMemo(() => new Map(list.items.map((i) => [i.id, i.name])), [list.items]);
  const offers = useMemo(
    () => applySelections(responses.flatMap((r) => r.offers), list.selections, itemNames),
    [responses, list.selections, itemNames],
  );
  const [picking, setPicking] = useState<{ itemId: string; providerId: ProviderId } | null>(null);
  const openPicker: OpenPicker = (itemId, providerId) => setPicking({ itemId, providerId });
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
              <ProviderName id={p.id} name={`${p.name}: ${label}`} size="s" />
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

      {cross && (
        <CrossNotice
          cross={cross}
          offers={offers}
          items={list.items}
          providers={providers}
          onOpen={openPicker}
          onDismiss={onDismissCross}
        />
      )}

      <PendingBanner offers={offers} items={list.items} providers={providers} onOpen={openPicker} />

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
            <ProductDetail
              key={it.id}
              item={it}
              offers={offers}
              providers={providers}
              onOpen={openPicker}
              refinedText={refinementFor(list, it.id, it.name)?.text ?? null}
              refinedFrom={nameOf.get(refinementFor(list, it.id, it.name)?.fromProvider ?? 'exito') ?? null}
            />
          ))}
        </div>
        {!busy && responses.length > 0 && (
          <p className="muted small">
            Precios leídos de las páginas públicas de cada supermercado. {nameOf.get('rappi') ?? 'Rappi'}, los productos por confirmar y
            los equivalentes nunca se suman en los totales.
          </p>
        )}
      </section>

      {picking &&
        (() => {
          const offer = offers.find((o) => o.itemId === picking.itemId && o.providerId === picking.providerId);
          const itemName = itemNames.get(picking.itemId);
          if (!offer || itemName === undefined) return null;
          const sel = selectionFor(list.selections, picking.itemId, itemName, picking.providerId);
          return (
            <ProductPicker
              itemName={itemName}
              providerId={picking.providerId}
              providerName={nameOf.get(picking.providerId) ?? picking.providerId}
              offer={offer}
              selectedKey={sel?.kind === 'producto' ? sel.key : null}
              onPick={(s) => {
                onSelect(picking.itemId, picking.providerId, s);
                setPicking(null);
              }}
              onClose={() => setPicking(null)}
            />
          );
        })()}
    </>
  );
}
