// Supabase backend for sync. Table public.content_os_records (user_id, coll, id, data, deleted, updated_at), RLS own rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Row } from './store'

const URL = 'https://ngdsdkqimosiiqzdacci.supabase.co'
const KEY = 'sb_publishable_iYX1cp7gNmUjpHT-iRzm4A_qo0TTB51'
const TABLE = 'content_os_records'

export const sb: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vzc:auth' },
})

export function makeBackend(userId: string): Backend {
  return {
    async push(rows) {
      const { error } = await sb.from(TABLE).upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,coll,id' })
      if (error) throw new Error(error.message)
    },
    async pullSince(cursor) {
      const out: Row[] = []
      for (let from = 0; ; from += 1000) {
        let q = sb.from(TABLE).select('coll,id,data,deleted,updated_at').order('updated_at', { ascending: true }).range(from, from + 999)
        if (cursor) q = q.gt('updated_at', cursor)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        out.push(...((data || []) as Row[]))
        if (!data || data.length < 1000) break
      }
      return out
    },
    subscribe(onRows) {
      const ch = sb.channel('content-os-' + userId)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (p: any) => {
          if (p.new && p.new.id) onRows([p.new as Row])
        })
        .subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
}
