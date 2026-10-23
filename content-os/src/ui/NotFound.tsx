import React from 'react'
import { go } from '../lib/router'
import { Empty, Button } from './kit'

export function NotFound({ what = 'Halaman', backTo = '/overview' }: { what?: string; backTo?: string }) {
  return (
    <main className="main"><Empty title={`${what} tidak ditemukan`} body="Mungkin sudah dihapus permanen atau link-nya salah." action={<Button variant="primary" onClick={() => go(backTo)}>Kembali</Button>} /></main>
  )
}
