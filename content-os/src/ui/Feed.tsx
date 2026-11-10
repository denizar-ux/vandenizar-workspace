import React from 'react'
import { igItems, slotById, firstLine } from '../lib/model'
import { tz } from '../lib/store'
import { dateKey, fmtShort } from '../lib/time'
import { go } from '../lib/router'
import { CoverThumb, useFonts } from '../studio/ui'
import { cx } from './kit'
import type { Item } from '../lib/types'

/** The profile grid as it will look: planned posts on top (latest first), then what's posted. */
export function Feed() {
  const ready = useFonts()
  const z = tz()
  const key = (i: Item) => (i.stage === 'done' ? (i.postedAt ? dateKey(i.postedAt, z) : i.date || '') : i.date || '9999')
  const planned = igItems().filter((i) => i.stage !== 'done' && i.date).sort((a, b) => (key(a) < key(b) ? 1 : -1))
  const posted = igItems().filter((i) => i.stage === 'done').sort((a, b) => (key(a) < key(b) ? 1 : -1))
  const list = [...planned, ...posted]
  if (!list.length) return <p className="muted small">Planned and posted posts show up here as your profile grid.</p>
  return (
    <div className="stack">
      <p className="small muted">Planned posts on top, the way your profile will look. Covers come from each post's Cover tool, or its title until you make one.</p>
      <div className="feed">
        {list.map((i) => (
          <button key={i.id} className={cx('feed-tile', i.stage !== 'done' && 'planned')} onClick={() => go(`/post/${i.id}/cover`)} aria-label={`${firstLine(i.title) || 'Untitled'}, open cover`}>
            <CoverThumb it={i} ready={ready} />
            <span className="feed-meta">{i.stage === 'done' ? 'Posted' : fmtShort(i.date!, z)}{slotById(i.slot) ? ' · ' + slotById(i.slot)!.name : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
