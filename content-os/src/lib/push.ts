// Web push for Content OS: subscribe this device; the "content-push" edge function decides what to send.
import { sb } from './supabase'

const VAPID_PUBLIC = 'BFPkY9UzbadR5YZERroJ5TWg07DfRHN6YfFcOqlRxTwiAdi2zVouilGa_hry4M9wnN0_RGJnsEn25CdVq-NB_Cs'
const FN_URL = 'https://ngdsdkqimosiiqzdacci.supabase.co/functions/v1/content-push'

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  return reg
}
function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || isIOS()) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  return 'Browser'
}

export async function pushStatus(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && (await reg.pushManager.getSubscription())
    return !!sub && Notification.permission === 'granted'
  } catch { return false }
}

export async function enablePush() {
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user) throw new Error('Sign in first.')
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? 'On iPhone, add Content OS to your Home Screen first, then open it from there.' : "This browser can't show notifications.")
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your phone settings.')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) })
  const j = sub.toJSON() as any
  const { error } = await sb.from('content_push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName(), user_id: user.id }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg && (await reg.pushManager.getSubscription())
  if (sub) {
    await sb.from('content_push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export async function testPush(): Promise<number> {
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in first.')
  const res = await fetch(FN_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || "Couldn't send a test.")
  return out.sent || 0
}
