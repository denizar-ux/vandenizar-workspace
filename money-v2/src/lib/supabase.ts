// Supabase backend (web build). Table public.money_records (user_id, coll, id, data, deleted, updated_at), RLS own rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = 'https://ngdsdkqimosiiqzdacci.supabase.co'
const KEY = 'sb_publishable_iYX1cp7gNmUjpHT-iRzm4A_qo0TTB51'
export const TABLE = 'money_records'

export const sb: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vzm:auth' },
})

export type Row = { coll: string; id: string; data: any; deleted: boolean; updated_at: string }

export function makeBackend(userId: string) {
  return {
    async push(rows: { coll: string; id: string; data: any; deleted: boolean }[]) {
      const { error } = await sb.from(TABLE).upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,coll,id' })
      if (error) throw new Error(error.message)
    },
    async pullSince(cursor: string | null) {
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
    subscribe(onRows: (rows: Row[]) => void) {
      const ch = sb.channel('money-' + userId)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (p: any) => {
          if (p.new && p.new.id) onRows([p.new as Row])
        })
        .subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
}
export type Backend = ReturnType<typeof makeBackend>
