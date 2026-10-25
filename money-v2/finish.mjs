// Artifact pages are wrapped in their own skeleton: keep <title> and the viewport-fit meta at the very top.
import { readFileSync, writeFileSync } from 'fs'
const f = new URL('./dist/index.html', import.meta.url)
let s = readFileSync(f, 'utf8')
const head = []
s = s.replace(/<title>[^<]*<\/title>\s*/, (m) => { head.push(m.trim()); return '' })
s = s.replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, (m) => { head.push(m.trim()); return '' })
s = s.replace(/<meta name="(viewport|theme-color|apple-mobile-web-app-[a-z-]+)"[^>]*>\s*/g, '')
s = s.replace(/<link rel="icon"[^>]*>\s*/g, '')
s = s.replace(/<meta charset[^>]*>\s*/gi, '')
s = s.replace(/<!doctype html>|<\/?html[^>]*>|<\/?head>|<\/?body>/gi, '')
writeFileSync(f, head.join('\n') + '\n' + s)
