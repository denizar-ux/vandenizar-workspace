import React from 'react'
import { useSheets, closeSheet } from '../ui/bus'
import { CaptureSheet, NewContentSheet } from './Capture'
import { TaskSheet } from './TaskSheet'
import { PublishSheet, SchedulePostSheet, BatchPickSheet, SearchSheet } from './Misc'
import { ResourceForm, UseResourceSheet, LinkResourceSheet } from './ResourceSheets'

export function SheetHost() {
  const stack = useSheets()
  return (
    <>
      {stack.map((s) => {
        const close = () => closeSheet(s.key)
        switch (s.type) {
          case 'capture': return <CaptureSheet key={s.key} onClose={close} text={s.text} />
          case 'newContent': return <NewContentSheet key={s.key} onClose={close} channel={s.channel} text={s.text} />
          case 'task': return <TaskSheet key={s.key} onClose={close} taskId={s.taskId} defaults={s.defaults} />
          case 'publish': return <PublishSheet key={s.key} onClose={close} contentId={s.contentId} />
          case 'schedulePost': return <SchedulePostSheet key={s.key} onClose={close} contentId={s.contentId} date={s.date} />
          case 'batchPick': return <BatchPickSheet key={s.key} onClose={close} taskId={s.taskId} contentId={s.contentId} />
          case 'search': return <SearchSheet key={s.key} onClose={close} />
          case 'resource': return <ResourceForm key={s.key} onClose={close} id={s.id} defaults={s.defaults} linkTo={s.linkTo} />
          case 'useResource': return <UseResourceSheet key={s.key} onClose={close} resourceId={s.resourceId} />
          case 'linkResource': return <LinkResourceSheet key={s.key} onClose={close} contentId={s.contentId} />
        }
      })}
    </>
  )
}
