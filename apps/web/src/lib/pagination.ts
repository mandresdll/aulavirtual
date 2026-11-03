/** Ventana de páginas alrededor de la actual, con la primera y la última siempre visibles. */
export function pageWindow(page: number, totalPages: number, radius = 1): (number | 'gap')[] {
  const pages = new Set([1, totalPages]);
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, index) => {
    const previous = sorted[index - 1];
    return previous !== undefined && p - previous > 1 ? (['gap', p] as const) : [p];
  });
}
