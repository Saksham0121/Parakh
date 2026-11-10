export const isIndian = (s: string) => /\.(NS|BO)$/i.test(s);

export function exchangeOf(symbol: string): string {
  if (/\.NS$/i.test(symbol)) return 'NSE';
  if (/\.BO$/i.test(symbol)) return 'BSE';
  if (/^BINANCE:|-USD$/i.test(symbol)) return 'Crypto';
  return 'US';
}

export const displaySymbol = (s: string) => s.replace(/^BINANCE:/i, '').replace(/\.(NS|BO)$/i, '');

export function currencySign(symbol: string, currency?: string): string {
  const c = (currency || '').toUpperCase();
  if (c === 'INR' || (!c && isIndian(symbol))) return '₹';
  if (c === 'EUR') return '€';
  if (c === 'GBP' || c === 'GBp') return '£';
  return '$';
}

const priceFmt = new Map<number, Intl.NumberFormat>();
export function fmtPrice(v: number | null | undefined, digits?: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const d = digits ?? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4);
  let f = priceFmt.get(d);
  if (!f) { f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }); priceFmt.set(d, f); }
  return f.format(v);
}

export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${signed && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v);
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: digits });
}

export function fmtDate(ms: number, withTime = false): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export function timeAgo(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return 'just now';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const toneOf = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');
