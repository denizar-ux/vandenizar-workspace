// Web push: subscribe this device so reminders arrive even when the app is closed.
// The server (Supabase edge function "push-reminders", run every minute) decides what to send.
import { supabase, sync } from './sync.js';

const VAPID_PUBLIC = 'BFPkY9UzbadR5YZERroJ5TWg07DfRHN6YfFcOqlRxTwiAdi2zVouilGa_hry4M9wnN0_RGJnsEn25CdVq-NB_Cs';
const FN_URL = 'https://ngdsdkqimosiiqzdacci.supabase.co/functions/v1/push-reminders';
const FLAG = 'vz:push';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
export const pushFlag = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const setFlag = (on) => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch {} };

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
  return navigator.serviceWorker.ready.then(() => reg);
}
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || isIOS()) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Browser';
}

// Is this device subscribed right now?
export async function pushStatus() {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    const on = !!sub && Notification.permission === 'granted';
    setFlag(on);
    return on;
  } catch { return false; }
}

export async function enablePush() {
  if (!sync.user) throw new Error('Sign in first so reminders know which tasks are yours.');
  if (!pushSupported()) throw new Error(isIOS() ? 'Open the app from your Home Screen to turn on notifications.' : 'This browser does not support notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your device settings.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName(), user_id: sync.user.id }, { onConflict: 'endpoint' });
  if (error) throw error;
  setFlag(true);
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } finally { setFlag(false); }
}

export async function testPush() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(FN_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Could not send a test.');
  return out.sent || 0;
}
