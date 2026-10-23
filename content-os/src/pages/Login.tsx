import React, { useState } from 'react'
import { sb } from '../lib/supabase'
import { Button, Field } from '../ui/kit'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !pw) { setErr('Isi email dan password.'); return }
    setBusy(true); setErr('')
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Email atau password salah.' : navigator.onLine === false ? 'Lagi offline. Sambungkan internet untuk masuk pertama kali.' : error.message)
  }
  return (
    <main className="main login">
      <div className="brand-mini">vandenizar <span>/ content OS</span></div>
      <h1 className="page-title mt24">Masuk.</h1>
      <p className="muted mt8">Pakai akun Vandenizar Workspace. Data tersinkron antara iPhone dan Mac.</p>
      <form className="stack mt24" onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="l-email"><input id="l-email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="l-pw" error={err || undefined}><input id="l-pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</Button>
      </form>
    </main>
  )
}
