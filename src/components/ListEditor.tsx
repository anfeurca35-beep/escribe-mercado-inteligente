'use client';

import { useRef, useState, type FormEvent } from 'react';
import { readListFromPhoto } from '@/lib/client';
import { parseListText } from '@/lib/listParse';
import { parseQuery } from '@/lib/matching';
import { LIMITS } from '@/lib/validation';
import type { ListItem } from '@/lib/types';
import type { ShoppingList } from '@/lib/storage';

interface Props {
  list: ShoppingList;
  photoImport: boolean;
  onChange: (list: ShoppingList) => void;
  onCompare: () => void;
  newItemId: () => string;
}

/** Consejo para que el matching pueda confirmar un EXACTO. */
function itemTip(name: string): string | null {
  const q = parseQuery(name);
  if (q.descriptors.length === 0) return 'Escribe también qué producto es (por ejemplo "atún", "papel higiénico").';
  if (!q.presentation.size && !q.presentation.count) return 'Agrega el tamaño (g, ml, kg, L o unidades) para poder comparar exacto.';
  return null;
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={`Cantidad de ${label}`}>
      <button type="button" aria-label="Quitar uno" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>
        −
      </button>
      <output className="num" aria-live="polite">
        {value}
      </output>
      <button type="button" aria-label="Agregar uno" onClick={() => onChange(Math.min(LIMITS.maxQty, value + 1))}>
        +
      </button>
    </div>
  );
}

export function ListEditor({ list, photoImport, onChange, onCompare, newItemId }: Props) {
  const [draft, setDraft] = useState('');
  const [qty, setQty] = useState(1);
  const [pasted, setPasted] = useState('');
  const [photoState, setPhotoState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const fileRef = useRef<HTMLInputElement>(null);

  const full = list.items.length >= LIMITS.maxItems;

  function update(items: ListItem[]) {
    onChange({ ...list, items, updatedAt: new Date().toISOString() });
  }

  function addItems(entries: Array<{ name: string; quantity: number }>) {
    const room = LIMITS.maxItems - list.items.length;
    const toAdd = entries.slice(0, Math.max(0, room)).map((e) => ({ id: newItemId(), name: e.name.slice(0, LIMITS.maxName), quantity: e.quantity }));
    update([...list.items, ...toAdd]);
    return toAdd.length;
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (name.length < 2 || full) return;
    addItems([{ name, quantity: qty }]);
    setDraft('');
    setQty(1);
  }

  function onPaste() {
    const parsed = parseListText(pasted);
    if (parsed.length === 0) return;
    addItems(parsed);
    setPasted('');
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoState({ busy: true, message: null });
    try {
      const result = await readListFromPhoto(file);
      const added = addItems(result.items);
      setPhotoState({
        busy: false,
        message:
          added > 0
            ? `Se agregaron ${added} productos leídos de la foto. Revísalos y corrígelos antes de comparar.`
            : (result.message ?? 'No se reconocieron productos en la foto.'),
      });
    } catch (err) {
      setPhotoState({ busy: false, message: err instanceof Error ? err.message : 'No se pudo leer la foto.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <label className="field">
        <span>Nombre de la lista</span>
        <input
          className="input"
          value={list.name}
          maxLength={60}
          onChange={(e) => onChange({ ...list, name: e.target.value, updatedAt: new Date().toISOString() })}
        />
      </label>

      <form onSubmit={onAdd} className="field">
        <label htmlFor="new-item">
          <span style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Agregar producto</span>
        </label>
        <div className="add-row">
          <input
            id="new-item"
            className="input"
            placeholder="Ej: Arroz Diana 1000 g"
            value={draft}
            maxLength={LIMITS.maxName}
            onChange={(e) => setDraft(e.target.value)}
            disabled={full}
            autoComplete="off"
          />
          <Stepper value={qty} onChange={setQty} label="producto nuevo" />
          <button className="btn" type="submit" disabled={draft.trim().length < 2 || full}>
            Agregar
          </button>
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {full ? `La lista llegó al máximo de ${LIMITS.maxItems} productos.` : 'Escribe tipo de producto, marca y tamaño para comparar exacto.'}
        </p>
      </form>

      {list.items.length === 0 ? (
        <p className="empty muted" style={{ marginTop: 18 }}>
          La lista está vacía. Agrega productos arriba, pega una lista o importa una foto.
        </p>
      ) : (
        <ul className="items" aria-label="Productos de la lista">
          {list.items.map((it) => {
            const tip = itemTip(it.name);
            return (
              <li key={it.id}>
                <input
                  className="name-input"
                  value={it.name}
                  maxLength={LIMITS.maxName}
                  aria-label="Nombre del producto"
                  onChange={(e) => update(list.items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                />
                <Stepper
                  value={it.quantity}
                  label={it.name}
                  onChange={(v) => update(list.items.map((x) => (x.id === it.id ? { ...x, quantity: v } : x)))}
                />
                <button className="icon-btn" aria-label={`Quitar ${it.name}`} onClick={() => update(list.items.filter((x) => x.id !== it.id))}>
                  ×
                </button>
                {tip && <span className="tip">{tip}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <details className="panel">
        <summary>Pegar una lista escrita</summary>
        <p className="muted small">Un producto por línea. Puedes poner la cantidad al inicio: «2 Arroz Diana 1000 g».</p>
        <textarea
          className="textarea"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={'2 Arroz Diana 1000 g\nLeche entera Alquería 1 L\nHuevos AA x30'}
          aria-label="Lista pegada"
        />
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={onPaste} disabled={parseListText(pasted).length === 0 || full}>
          Agregar a la lista
        </button>
      </details>

      <details className="panel">
        <summary>Importar desde una foto</summary>
        {photoImport ? (
          <>
            <p className="muted small">
              Toma una foto o sube una captura de tu lista. La foto se lee y se descarta; no se guarda. Revisa el resultado antes de comparar.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => onPhoto(e.target.files?.[0])}
              disabled={photoState.busy || full}
              aria-label="Foto de la lista"
            />
            {photoState.busy && <p className="small">Leyendo la foto…</p>}
          </>
        ) : (
          <p className="muted small">
            La lectura de fotos todavía no está activada en esta versión. Mientras tanto, usa «Pegar una lista escrita».
          </p>
        )}
        {photoState.message && (
          <p className="notice warn small" role="status">
            {photoState.message}
          </p>
        )}
      </details>

      <div className="sticky-cta">
        <div className="inner">
          <button className="btn block" onClick={onCompare} disabled={list.items.length === 0}>
            {list.items.length === 0 ? 'Agrega productos para comparar' : `Comparar precios de ${list.items.length} productos`}
          </button>
        </div>
      </div>
    </>
  );
}
