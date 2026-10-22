// The few Workspace settings the Money app reads (week start, language), stored in meta/settings.
import { get, put } from './store.js';

export const DEFAULT_SETTINGS = { id: 'settings', weekStart: 1, language: '' };
export const settings = () => ({ ...DEFAULT_SETTINGS, ...(get('meta', 'settings') || {}) });
export const setSettings = (ch) => put('meta', { ...settings(), ...(typeof ch === 'function' ? ch(settings()) : ch), id: 'settings' });
