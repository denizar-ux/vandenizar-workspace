import React from 'react'
import {
  Utensils, Fuel, Coffee, ShoppingBag, Car, House, Heart, Tv, Camera, HeartPulse, Package, Receipt, Briefcase, Video, Link2, Inbox, Tag,
  Gift, Plane, GraduationCap, Gamepad2, Dumbbell, Shirt, Baby, PawPrint, Smartphone, Wifi, Zap, Droplet, Music, Book, Wrench, PiggyBank,
  Wallet, TrendingUp, Landmark, Scissors, CreditCard, Banknote,
} from 'lucide-react'
import { tone, catIcon, catTone, type Account } from '../lib/money'
import { cx } from './kit'

export const CAT_ICONS: Record<string, any> = {
  food: Utensils, fuel: Fuel, coffee: Coffee, bag: ShoppingBag, car: Car, home: House, heart: Heart, tv: Tv, camera: Camera, health: HeartPulse,
  box: Package, receipt: Receipt, briefcase: Briefcase, video: Video, link: Link2, tray: Inbox, tag: Tag, gift: Gift, plane: Plane, school: GraduationCap,
  game: Gamepad2, gym: Dumbbell, shirt: Shirt, baby: Baby, pet: PawPrint, phone: Smartphone, wifi: Wifi, power: Zap, water: Droplet, music: Music,
  book: Book, tools: Wrench, save: PiggyBank, wallet: Wallet, invest: TrendingUp, bank: Landmark, beauty: Scissors, card: CreditCard, cash: Banknote,
}

export function CatIc({ id, size = 18, big }: { id?: string; size?: number; big?: boolean }) {
  const I = CAT_ICONS[catIcon(id)] || Tag
  return <span className={cx('ic', big && 'ic-lg', 'bg-' + catTone(id))} aria-hidden><I size={size} /></span>
}
export function AccIc({ a, size = 18 }: { a?: Account; size?: number }) {
  const I = !a ? Wallet : a.type === 'credit' ? CreditCard : a.type === 'cash' ? Banknote : a.type === 'invest' ? TrendingUp : a.type === 'ewallet' ? Smartphone : null
  return <span className={cx('ic', 'bg-' + tone(a?.tone))} aria-hidden>{I ? <I size={size} /> : <b>{(a?.name || '?').slice(0, 1).toUpperCase()}</b>}</span>
}
