'use client';

import { useState } from 'react';
import { CITIES, cityFromCoords } from '@/lib/location';
import type { CityId } from '@/lib/types';

interface Props {
  current: CityId | null;
  onPick: (city: CityId) => void;
  onClose: () => void;
}

export function CityPicker({ current, onPick, onClose }: Props) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function useLocation() {
    if (!('geolocation' in navigator)) {
      setMessage('Este dispositivo no permite usar la ubicación. Elige tu ciudad en la lista.');
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // Se calcula la ciudad y se descartan las coordenadas.
        const city = cityFromCoords(pos.coords.latitude, pos.coords.longitude);
        if (city) onPick(city);
        else setMessage('Tu ubicación está fuera de las ciudades disponibles por ahora. Elige una ciudad en la lista.');
      },
      (err) => {
        setLocating(false);
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? 'No diste permiso para usar tu ubicación. Elige tu ciudad en la lista.'
            : 'No se pudo obtener tu ubicación. Elige tu ciudad en la lista.',
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="city-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="city-title">¿Dónde vas a comprar?</h2>
        <p className="muted small">
          Los precios y los supermercados disponibles cambian según la ciudad. Solo guardamos la ciudad en este dispositivo, nunca tu
          ubicación exacta.
        </p>
        <button className="btn block" onClick={useLocation} disabled={locating}>
          {locating ? 'Buscando tu ciudad…' : 'Usar mi ubicación'}
        </button>
        {message && (
          <p className="notice warn small" role="status" style={{ marginTop: 12 }}>
            {message}
          </p>
        )}
        <h3 style={{ marginTop: 20 }}>Seleccionar ciudad manualmente</h3>
        <div className="city-options">
          {CITIES.map((c) => (
            <button key={c.id} aria-pressed={current === c.id} onClick={() => onPick(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
