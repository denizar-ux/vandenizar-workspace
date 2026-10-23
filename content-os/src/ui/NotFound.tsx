import React from 'react'
import { go } from '../lib/router'
import { Empty, Button } from './kit'

export function NotFound({ what = 'Page', backTo = '/today' }: { what?: string; backTo?: string }) {
  return (
    <main className="main"><Empty title={`${what} not found`} body="It may have been deleted, or the link is wrong." action={<Button variant="primary" onClick={() => go(backTo)}>Go back</Button>} /></main>
  )
}
