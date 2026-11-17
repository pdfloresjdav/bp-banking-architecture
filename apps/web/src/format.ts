export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US');
}
