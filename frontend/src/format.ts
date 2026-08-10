export function compactNumber(value: number | string): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(
    Number(value),
  );
}

export function metric(value: number, digits = 3): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function percent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
