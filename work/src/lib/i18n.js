// The interface is English. t() keeps the old call sites working and fills {placeholders}.
export const lang = () => 'en';
export const isID = () => false;
export const locale = () => 'en-GB';
export function t(en, vars) {
  let s = en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
export function tn(n, one, many, vars) { return t(n === 1 ? one : many, { n, ...(vars || {}) }); }
