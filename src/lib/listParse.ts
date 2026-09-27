// Convierte texto pegado (o leído de una foto) en productos con cantidad.
// Formatos aceptados por línea: "2 Arroz Diana 1000 g", "2x Arroz Diana 1000 g",
// "- Leche entera 1 L (3)", "3x Huevos AA x30".

export interface ParsedLine {
  name: string;
  quantity: number;
}

export function parseListText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/^[\s\-•*·▪◦]+|^\d+[.)]\s+/g, '').trim();
    if (line.length < 2) continue;
    let quantity = 1;

    // "2 Arroz..." o "2x Arroz..." al inicio (sin unidad de medida detrás)
    const lead = line.match(/^(\d{1,2})\s*(?:x|×|und|unds|uds)?\s+(?![\d.,]*\s*(?:kg|g|gr|ml|l|lt)\b)(.+)$/i);
    if (lead) {
      quantity = Number(lead[1]);
      line = lead[2];
    } else {
      // "(3)" al final
      const paren = line.match(/^(.+?)\s*\((\d{1,2})\)$/);
      if (paren) {
        quantity = Number(paren[2]);
        line = paren[1];
      } else {
        // "cant: 2" o "cantidad 2" al final
        const cant = line.match(/^(.+?)\s*(?:cant(?:idad)?\.?:?)\s*(\d{1,2})$/i);
        if (cant) {
          quantity = Number(cant[2]);
          line = cant[1];
        }
      }
    }
    const name = line.replace(/\s+/g, ' ').trim();
    if (name.length < 2) continue;
    out.push({ name: name.slice(0, 120), quantity: Math.min(Math.max(quantity, 1), 99) });
  }
  return out;
}
