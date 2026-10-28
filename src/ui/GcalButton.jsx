import { Icon } from './Icon.jsx';
import { gcalUrl } from '../lib/gcal.js';

export function GcalButton({ event, label = 'Add to Google Calendar', size = 'sm' }) {
  const url = event && gcalUrl(event);
  if (!url) return null;
  return <a class={'btn outline ' + size} href={url} target="_blank" rel="noopener noreferrer"><Icon name="calendar" size={15} />{label}</a>;
}
