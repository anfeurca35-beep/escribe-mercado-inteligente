# Mercado Inteligente — Beta 1.0

Comparador de precios de listas de mercado en supermercados de Colombia.
Principio central: **datos reales, matching honesto, cálculos correctos y recomendaciones basadas en cobertura real.** Nunca se inventan precios.

## Qué hace

- Crear listas con cantidades, pegar una lista escrita o importarla desde una foto (opcional, requiere `ANTHROPIC_API_KEY`).
- Consultar bajo demanda solo los productos de la lista en Éxito, D1, Euro y Rappi.
- Clasificar cada coincidencia como **Exacto**, **Probable**, **Equivalente** o **No encontrado**.
- Selección y confirmación: un único exacto se elige solo; si hay varios candidatos o solo probables, el usuario elige entre 3–5 opciones (foto, nombre, marca, presentación, precio) o marca «Ninguno corresponde». La elección se guarda por lista en el dispositivo y se puede cambiar. Los equivalentes se muestran como alternativas y nunca se eligen solos.
- Recomendar "comprar todo en un lugar" **solo** con 100 % de cobertura exacta; si no, mostrar la mejor cobertura real.
- Calcular el **máximo ahorro** repartiendo la compra, solo con exactos, multiplicando por cantidad.
- Ubicación: "Usar mi ubicación" o selección manual. Solo se guarda la ciudad.

## Estado de proveedores

| Proveedor | Estado | Nota |
|---|---|---|
| Éxito | Activo | Búsqueda pública VTEX + página de producto como respaldo |
| Euro | Activo | Búsqueda pública VTEX + página de producto; opera en Medellín y Barranquilla |
| D1 | Activo | Búsqueda en domicilios.tiendasd1.com (a verificar en producción) |
| Rappi | Parcial | Marketplace: se muestra aparte y nunca entra en totales |
| La Vaquita | Pendiente | Sin acceso verificable |
| Ara | Pendiente | El sitio responde 403; no se hace bypass |

Desactivar un proveedor sin tocar código: `PROVIDERS_DISABLED=d1,rappi`.

## Reglas de datos

- Sin precio verificable → `null`, nunca `$0`.
- Estados de consulta: OK, sin precio, no encontrado, proveedor no disponible, pendiente de integración.
- Se respeta `robots.txt`, se limita la frecuencia por sitio, hay caché de 20 minutos y timeout de 9 s. No se evaden CAPTCHA, sesiones ni bloqueos.

## Comandos

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # pruebas (node:test + tsx)
npm run build
npm start
```

## Despliegue en Render

`render.yaml` define el servicio. El build ejecuta tipos, pruebas y compilación; si alguna falla, no se publica.
Salud: `GET /api/health`.

## Estructura

- `src/lib/` — lógica pura: unidades, matching, comparación, validación, ubicación.
- `src/lib/providers/` — cliente HTTP respetuoso, parsers, adaptadores y registro de proveedores.
- `src/app/api/` — rutas: `prices`, `providers`, `ocr`, `health`.
- `src/components/` — interfaz.
- `tests/` — pruebas. Los fixtures son reconstrucciones con la estructura documentada de cada sitio, no copias de páginas reales.
