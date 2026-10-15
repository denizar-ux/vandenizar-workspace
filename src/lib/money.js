// Money is stored as integer minor units (IDR has 0 decimals, USD 2) to avoid float errors.
export const CURRENCIES = { IDR: { dec: 0, symbol: 'Rp', locale: 'id-ID' }, USD: { dec: 2, symbol: '$', locale: 'en-US' }, SGD: { dec: 2, symbol: 'S$', locale: 'en-SG' }, EUR: { dec: 2, symbol: '€', locale: 'de-DE' } };
const cur = (c) => CURRENCIES[c] || CURRENCIES.IDR;

export function fmtMoney(minor, currency = 'IDR', { compact = false } = {}) {
  const c = cur(currency);
  const v = (Math.round(+minor || 0)) / 10 ** c.dec;
  if (compact && Math.abs(v) >= 1000) {
    const abs = Math.abs(v);
    const [n, s] = abs >= 1e9 ? [v / 1e9, 'B'] : abs >= 1e6 ? [v / 1e6, currency === 'IDR' ? 'jt' : 'M'] : [v / 1e3, currency === 'IDR' ? 'rb' : 'K'];
    const t = (Math.round(n * 10) / 10).toLocaleString(c.locale, { maximumFractionDigits: 1 });
    return `${c.symbol} ${t}${s}`;
  }
  const t = v.toLocaleString(c.locale, { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
  return `${c.symbol} ${t}`;
}
// Text value for editing inputs (no symbol)
export function moneyInput(minor, currency = 'IDR') {
  if (minor === '' || minor == null) return '';
  const c = cur(currency);
  const v = Math.round(+minor) / 10 ** c.dec;
  return v.toLocaleString(c.locale, { minimumFractionDigits: 0, maximumFractionDigits: c.dec });
}
// Parse what a person types: "1.500.000", "1500000", "1,5jt", "2.5k", "1,250.50"
export function parseMoney(str, currency = 'IDR') {
  if (typeof str === 'number') return Math.round(str * 10 ** cur(currency).dec);
  let s = String(str || '').trim().toLowerCase().replace(/rp|\$|s\$|€|idr|usd|\s/g, '');
  if (!s) return 0;
  let mult = 1;
  const m = s.match(/(jt|juta|m|rb|ribu|k|b|miliar)$/);
  if (m) { mult = { jt: 1e6, juta: 1e6, m: 1e6, rb: 1e3, ribu: 1e3, k: 1e3, b: 1e9, miliar: 1e9 }[m[1]]; s = s.slice(0, -m[1].length); }
  const c = cur(currency);
  let num;
  if (c.dec === 0) {
    // Indonesian: dots are thousand separators, comma is a decimal (only meaningful with a multiplier)
    if (mult > 1) num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else num = parseFloat(s.replace(/[.,]/g, ''));
  } else {
    if (/,\d{1,2}$/.test(s) && !/\./.test(s)) s = s.replace(',', '.');
    num = parseFloat(s.replace(/,/g, ''));
  }
  if (!isFinite(num)) return NaN;
  return Math.round(num * mult * 10 ** c.dec);
}
export const minorToMajor = (minor, currency = 'IDR') => (+minor || 0) / 10 ** cur(currency).dec;
