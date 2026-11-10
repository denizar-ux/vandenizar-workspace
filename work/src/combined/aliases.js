// Old routes from the two source apps, redirected to their new home in the combined app.
const ALIASES = {
  '/today': '/',
  '/projects': '/work/projects',
  '/tasks': '/work/tasks',
  '/instagram': '/content/ig',
  '/threads': '/content/threads',
  '/resources': '/more/resources',
};

/** @returns {string|null} the new full hash path (query kept), or null when no alias applies */
export function resolveAlias(path, query = '') {
  const to = Object.prototype.hasOwnProperty.call(ALIASES, path) ? ALIASES[path] : null;
  if (!to) return null;
  const q = String(query || '').replace(/^\?/, '');
  return q ? to + '?' + q : to;
}
