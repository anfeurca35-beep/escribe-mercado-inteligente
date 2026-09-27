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
  mergeOffer,
  refinementFor,
  type Refinement,
  newId,
  saveState,
  type AppState,
  type ShoppingList,
} from '@/lib/storage';
import { refineFromProduct, refinementAddsInfo } from '@/lib/matching';
import { pinFor, selectionFor, setSelection, type SelectionMap, type UserSelection } from '@/lib/selection';
import type { CityId, ProviderId, ProviderInfo, ProviderPricesResponse } from '@/lib/types';
import { CityPicker } from './CityPicker';
import { ListEditor } from './ListEditor';
import { Results, type CrossSearch, type ProgressState } from './Results';
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

const VIEW_KEY = 'mi:vista';
const RESUME_KEY = 'mi:reanudar';
const RELOADED_KEY = 'mi:recargado';

/** ¿El servidor tiene una versión distinta (más nueva) que la de esta página? */
function isNewerVersion(serverVersion: string | undefined): boolean {
  const mine = process.env.NEXT_PUBLIC_APP_VERSION;
  return !!serverVersion && !!mine && serverVersion !== 'dev' && serverVersion !== mine;
}

/**
 * Recarga la página para usar la versión nueva. Si `compareListId` se indica,
 * al volver se vuelven a consultar los precios de esa lista. Devuelve false si
 * ya se recargó por esa versión (evita recargas en bucle).
 */
function reloadForUpdate(serverVersion: string, compareListId: string | null): boolean {
  try {
    if (window.sessionStorage.getItem(RELOADED_KEY) === serverVersion) return false;
    window.sessionStorage.setItem(RELOADED_KEY, serverVersion);
    if (compareListId) {
      window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ view: 'results', listId: compareListId, compare: true }));
    }
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function readResume(): { view: 'edit' | 'results'; listId: string; compare: boolean } | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY) ?? window.sessionStorage.getItem(VIEW_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { view?: unknown; listId?: unknown; compare?: unknown };
    if ((r.view !== 'edit' && r.view !== 'results') || typeof r.listId !== 'string') return null;
    return { view: r.view, listId: r.listId, compare: r.compare === true };
  } catch {
    return null;
  }
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
  const [cross, setCross] = useState<CrossSearch | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const runCompareRef = useRef<(listId: string, city: CityId, provs?: ProviderInfo[]) => Promise<void>>(async () => {});

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setReady(true);
    // Volver a la pantalla en la que estaba el usuario antes de recargar.
    const resume = readResume();
    if (resume && loaded.lists.some((l) => l.id === resume.listId)) {
      setView(resume.view === 'results' ? { name: 'results', listId: resume.listId } : { name: 'edit', listId: resume.listId });
    }
    fetchProviders()
      .then((p) => {
        if (isNewerVersion(p.version) && reloadForUpdate(p.version as string, null)) return;
        setProviders(p.providers);
        setPhotoImport(p.features.photoImport);
        if (resume?.compare && loaded.city && loaded.lists.some((l) => l.id === resume.listId)) {
          void runCompareRef.current(resume.listId, loaded.city, p.providers);
        }
      })
      .catch(() => {
        /* se usa la información local de proveedores */
      });

    // Al volver a la pestaña, revisar si hay una versión nueva publicada.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      fetchProviders()
        .then((p) => {
          if (isNewerVersion(p.version)) reloadForUpdate(p.version as string, null);
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Recordar la pantalla actual (para volver a ella tras una recarga).
  useEffect(() => {
    try {
      if (view.name === 'home') window.sessionStorage.removeItem(VIEW_KEY);
      else window.sessionStorage.setItem(VIEW_KEY, JSON.stringify({ view: view.name, listId: view.listId }));
    } catch {
      /* sin sessionStorage */
    }
  }, [view]);

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

  async function runCompare(listId: string, city: CityId, provs: ProviderInfo[] = providers) {
    const providers = provs;
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
          const matches = new Map<string, string>();
          for (const it of list.items) {
            const ref = refinementFor(list, it.id, it.name);
            if (ref) matches.set(it.id, ref.text);
          }
          const response = await fetchPrices(p.id, city, list.items, pins, matches);
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
    const list = stateRef.current.lists.find((l) => l.id === listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!list || !item) return;

    const selections = setSelection(list.selections, itemId, providerId, sel);
    const prev = refinementFor(list, itemId, item.name);

    // ¿Cambia la búsqueda para los demás supermercados?
    let next: Refinement | null = prev;
    if (sel?.kind === 'producto') {
      const offer = list.results?.responses.find((r) => r.providerId === providerId)?.offers.find((o) => o.itemId === itemId);
      const chosen = offer ? [...offer.candidates, ...offer.others].find((c) => c.key === sel.key) : undefined;
      if (chosen) {
        const text = refineFromProduct(item.name, chosen.product);
        next = refinementAddsInfo(item.name, text)
          ? { itemName: item.name, text, fromProvider: providerId, productName: chosen.product.name }
          : null;
      }
    } else if (prev && prev.fromProvider === providerId) {
      // Se deshizo o se rechazó la elección que originó la búsqueda refinada.
      next = null;
    }

    setState((s) => ({
      ...s,
      lists: s.lists.map((l) => {
        if (l.id !== listId) return l;
        const refinements = { ...(l.refinements ?? {}) };
        if (next) refinements[itemId] = next;
        else delete refinements[itemId];
        return { ...l, selections, refinements, updatedAt: new Date().toISOString() };
      }),
    }));

    // Al elegir un producto siempre se busca en los demás supermercados; al deshacer
    // o rechazar, solo si cambia la búsqueda.
    const changed = (prev?.text ?? null) !== (next?.text ?? null);
    const city = state.city ?? list.results?.city;
    if ((changed || sel?.kind === 'producto') && city && list.results) {
      void crossSearch(listId, item, next, providerId, selections, city, sel?.kind === 'producto' ? 'eleccion' : 'deshacer');
    }
  }

  /** Busca el mismo producto (o vuelve a buscar el original) en los supermercados sin decisión del usuario. */
  async function crossSearch(
    listId: string,
    item: { id: string; name: string; quantity: number },
    refinement: Refinement | null,
    sourceProvider: ProviderId,
    selections: SelectionMap,
    city: CityId,
    reason: CrossSearch['reason'],
  ) {
    const targets = providers.filter(
      (p) =>
        p.id !== sourceProvider &&
        p.integration !== 'pendiente' &&
        (p.cities === 'todas' || p.cities.includes(city)) &&
        selectionFor(selections, item.id, item.name, p.id) === null,
    );
    setCross({
      listId,
      itemId: item.id,
      text: refinement?.text ?? null,
      fromProvider: sourceProvider,
      reason,
      status: Object.fromEntries(targets.map((p) => [p.id, 'loading'])) as CrossSearch['status'],
    });
    if (targets.length === 0) return;
    const matches = new Map<string, string>(refinement ? [[item.id, refinement.text]] : []);
    await Promise.all(
      targets.map(async (p) => {
        let result: 'done' | 'error' = 'done';
        try {
          const response = await fetchPrices(p.id, city, [item], new Map(), matches);
          const offer = response.offers.find((o) => o.itemId === item.id);
          if (offer) {
            setState((s) => ({
              ...s,
              lists: s.lists.map((l) =>
                l.id === listId && l.results ? { ...l, results: mergeOffer(l.results, p.id, offer, response.fetchedAt) } : l,
              ),
            }));
          }
        } catch {
          result = 'error';
        }
        setCross((c) => (c && c.listId === listId && c.itemId === item.id ? { ...c, status: { ...c.status, [p.id]: result } } : c));
      }),
    );
  }

  runCompareRef.current = runCompare;

  async function compare(listId: string) {
    if (!state.city) {
      setPicker({ open: true, thenCompare: listId });
      return;
    }
    // Antes de consultar, asegurarse de estar usando la versión publicada más reciente.
    try {
      const p = await fetchProviders();
      if (isNewerVersion(p.version) && reloadForUpdate(p.version as string, listId)) return;
    } catch {
      /* si falla la verificación, se consulta con esta versión */
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
            cross={cross && cross.listId === current.id ? cross : null}
            onDismissCross={() => setCross(null)}
          />
        </main>
      )}

      {picker.open && (
        <CityPicker current={state.city} onPick={pickCity} onClose={() => setPicker({ open: false, thenCompare: null })} />
      )}
    </div>
  );
}
