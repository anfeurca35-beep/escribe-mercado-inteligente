'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPrices, fetchProviders } from '@/lib/client';
import { formatRelative } from '@/lib/format';
import { cityShortName } from '@/lib/location';
import { PROVIDER_INFO, PROVIDER_ORDER } from '@/lib/providers/info';
import {
  clearState,
  emptyState,
  listSignature,
  loadState,
  newId,
  saveState,
  type AppState,
  type ShoppingList,
} from '@/lib/storage';
import { pinFor, setSelection, type UserSelection } from '@/lib/selection';
import type { CityId, ProviderId, ProviderInfo, ProviderPricesResponse } from '@/lib/types';
import { CityPicker } from './CityPicker';
import { ListEditor } from './ListEditor';
import { Results, type ProgressState } from './Results';
import { Logo } from './ui';

type View = { name: 'home' } | { name: 'edit'; listId: string } | { name: 'results'; listId: string };

const FALLBACK_PROVIDERS: ProviderInfo[] = PROVIDER_ORDER.map((id) => PROVIDER_INFO[id]);

function unavailableResponse(providerId: ProviderId, city: CityId, list: ShoppingList, message: string): ProviderPricesResponse {
  const at = new Date().toISOString();
  return {
    providerId,
    city,
    fetchedAt: at,
    offers: list.items.map((it) => ({
      itemId: it.id,
      providerId,
      status: 'PROVEEDOR_NO_DISPONIBLE',
      match: 'NO_ENCONTRADO',
      matchReasons: [],
      product: null,
      candidates: [],
      equivalents: [],
      others: [],
      selection: 'no_aplica',
      eligible: false,
      locationConfirmed: false,
      includedInTotals: false,
      exclusionReason: null,
      note: message,
      fetchedAt: at,
    })),
  };
}

export function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ name: 'home' });
  const [providers, setProviders] = useState<ProviderInfo[]>(FALLBACK_PROVIDERS);
  const [photoImport, setPhotoImport] = useState(false);
  const [picker, setPicker] = useState<{ open: boolean; thenCompare: string | null }>({ open: false, thenCompare: null });
  const [progress, setProgress] = useState<Partial<Record<ProviderId, ProgressState>>>({});
  const [busy, setBusy] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(loadState());
    setReady(true);
    fetchProviders()
      .then((p) => {
        // Si el servidor ya tiene una versión más nueva que esta página, recargar una vez.
        const mine = process.env.NEXT_PUBLIC_APP_VERSION;
        if (p.version && mine && p.version !== mine && p.version !== 'dev') {
          try {
            if (window.sessionStorage.getItem('mi:recargado') !== p.version) {
              window.sessionStorage.setItem('mi:recargado', p.version);
              window.location.reload();
              return;
            }
          } catch {
            /* sin sessionStorage: se continúa con esta versión */
          }
        }
        setProviders(p.providers);
        setPhotoImport(p.features.photoImport);
      })
      .catch(() => {
        /* se usa la información local de proveedores */
      });
  }, []);

  useEffect(() => {
    if (ready) setStorageOk(saveState(state));
  }, [state, ready]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view.name]);

  const updateList = useCallback((list: ShoppingList) => {
    setState((s) => ({ ...s, lists: s.lists.map((l) => (l.id === list.id ? list : l)) }));
  }, []);

  function createList() {
    const now = new Date().toISOString();
    const count = state.lists.length + 1;
    const list: ShoppingList = { id: newId('l'), name: `Mercado ${count}`, items: [], createdAt: now, updatedAt: now, results: null };
    setState((s) => ({ ...s, lists: [list, ...s.lists] }));
    setView({ name: 'edit', listId: list.id });
  }

  function deleteList(id: string) {
    if (!window.confirm('¿Eliminar esta lista? Esta acción no se puede deshacer.')) return;
    setState((s) => ({ ...s, lists: s.lists.filter((l) => l.id !== id) }));
  }

  function deleteAll() {
    if (!window.confirm('¿Borrar todas tus listas, la ciudad elegida y los precios guardados en este dispositivo?')) return;
    clearState();
    setState(emptyState());
    setView({ name: 'home' });
  }

  async function runCompare(listId: string, city: CityId) {
    const list = stateRef.current.lists.find((l) => l.id === listId);
    if (!list || list.items.length === 0) return;
    const signature = listSignature(list.items);
    const keepOld = list.results && list.results.city === city && list.results.signature === signature;

    setState((s) => ({
      ...s,
      lists: s.lists.map((l) =>
        l.id === listId ? { ...l, results: { city, signature, responses: keepOld && l.results ? l.results.responses : [] } } : l,
      ),
    }));
    setView({ name: 'results', listId });
    setBusy(true);
    setProgress(Object.fromEntries(providers.map((p) => [p.id, { state: 'loading' }])) as Partial<Record<ProviderId, ProgressState>>);

    const store = (response: ProviderPricesResponse) => {
      setState((s) => ({
        ...s,
        lists: s.lists.map((l) => {
          if (l.id !== listId || !l.results) return l;
          const others = l.results.responses.filter((r) => r.providerId !== response.providerId);
          return { ...l, results: { ...l.results, responses: [...others, response] } };
        }),
      }));
    };

    await Promise.all(
      providers.map(async (p) => {
        try {
          const pins = new Map<string, string>();
          for (const it of list.items) {
            const pin = pinFor(list.selections, it.id, it.name, p.id);
            if (pin) pins.set(it.id, pin);
          }
          const response = await fetchPrices(p.id, city, list.items, pins);
          store(response);
          setProgress((pr) => ({ ...pr, [p.id]: { state: 'done' } }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'No se pudo consultar este supermercado.';
          store(unavailableResponse(p.id, city, list, message));
          setProgress((pr) => ({ ...pr, [p.id]: { state: 'error', message } }));
        }
      }),
    );
    setBusy(false);
  }

  function selectProduct(listId: string, itemId: string, providerId: ProviderId, sel: UserSelection | null) {
    setState((s) => ({
      ...s,
      lists: s.lists.map((l) =>
        l.id === listId ? { ...l, selections: setSelection(l.selections, itemId, providerId, sel), updatedAt: new Date().toISOString() } : l,
      ),
    }));
  }

  function compare(listId: string) {
    if (!state.city) {
      setPicker({ open: true, thenCompare: listId });
      return;
    }
    void runCompare(listId, state.city);
  }

  function pickCity(city: CityId) {
    setState((s) => ({ ...s, city }));
    const then = picker.thenCompare;
    setPicker({ open: false, thenCompare: null });
    if (then) void runCompare(then, city);
  }

  const current = view.name === 'home' ? null : state.lists.find((l) => l.id === view.listId) ?? null;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView({ name: 'home' })} aria-label="Mercado Inteligente, ir al inicio">
          <Logo />
          Mercado Inteligente
        </button>
        <button className="city-chip" onClick={() => setPicker({ open: true, thenCompare: null })}>
          {state.city ? `📍 ${cityShortName(state.city)}` : 'Elegir ciudad'}
        </button>
      </header>

      {!storageOk && (
        <p className="notice warn small">
          Este navegador no permite guardar datos. Tu lista funcionará, pero se perderá al cerrar la página.
        </p>
      )}

      {!ready ? (
        <p className="muted">Cargando…</p>
      ) : view.name === 'home' || !current ? (
        <main>
          <section className="hero">
            <h1>Tu lista de mercado, comparada en varios supermercados.</h1>
            <p className="lede">
              Escribe lo que necesitas, con marca y tamaño. Te mostramos dónde está cada producto, cuánto cuesta y qué tanto puedes ahorrar
              repartiendo la compra.
            </p>
          </section>

          <section className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2>Mis listas</h2>
              <button className="btn" onClick={createList}>
                Nueva lista
              </button>
            </div>
            {state.lists.length === 0 ? (
              <div className="empty">
                <p style={{ marginTop: 0 }}>Todavía no tienes listas.</p>
                <button className="btn" onClick={createList}>
                  Crear mi primera lista
                </button>
              </div>
            ) : (
              state.lists.map((l) => {
                const at = l.results?.responses.map((r) => r.fetchedAt).sort()[0];
                return (
                  <div className="list-card" key={l.id}>
                    <button className="open" onClick={() =>
                        setView(l.results?.responses.length ? { name: 'results', listId: l.id } : { name: 'edit', listId: l.id })
                      }>
                      <span className="title">{l.name || 'Sin nombre'}</span>
                      <span className="muted small">
                        {l.items.length} productos{at ? ` · precios ${formatRelative(at)}` : ' · sin comparar'}
                      </span>
                    </button>
                    <button className="btn secondary" onClick={() => setView({ name: 'edit', listId: l.id })}>
                      Editar
                    </button>
                    <button className="icon-btn" aria-label={`Eliminar ${l.name}`} onClick={() => deleteList(l.id)}>
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </section>

          <aside className="honesty">
            <p style={{ margin: '0 0 6px' }}>
              <strong>Cómo leemos los precios.</strong> Consultamos las páginas públicas de Éxito, Euro y D1 solo para los productos de tu lista.
              Si un precio no se puede verificar, lo decimos: nunca lo inventamos. Rappi se muestra aparte porque su precio depende de la tienda
              y de costos de envío que no conocemos. Ara y La Vaquita están pendientes de integración.
            </p>
            <p style={{ margin: 0 }}>
              Tus listas se guardan solo en este dispositivo.{' '}
              <button className="link-btn" onClick={deleteAll}>
                Borrar todos mis datos
              </button>
            </p>
          </aside>
        </main>
      ) : view.name === 'edit' ? (
        <main>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setView({ name: 'home' })}>
              ‹ Mis listas
            </button>
            {current.results && current.results.responses.length > 0 && (
              <button className="btn ghost" onClick={() => setView({ name: 'results', listId: current.id })}>
                Ver resultados
              </button>
            )}
          </div>
          <h1 style={{ marginTop: 6 }}>Editar lista</h1>
          <ListEditor
            list={current}
            photoImport={photoImport}
            onChange={updateList}
            onCompare={() => compare(current.id)}
            newItemId={() => newId('i')}
          />
        </main>
      ) : (
        <main>
          <Results
            list={current}
            providers={providers}
            city={state.city ?? current.results?.city ?? 'medellin'}
            progress={progress}
            busy={busy}
            onRefresh={() => compare(current.id)}
            onEdit={() => setView({ name: 'edit', listId: current.id })}
            onChangeCity={() => setPicker({ open: true, thenCompare: current.id })}
            onSelect={(itemId, providerId, sel) => selectProduct(current.id, itemId, providerId, sel)}
          />
        </main>
      )}

      {picker.open && (
        <CityPicker current={state.city} onPick={pickCity} onClose={() => setPicker({ open: false, thenCompare: null })} />
      )}
    </div>
  );
}
