#!/usr/bin/env node
// Standalone notification hook for oh-my-freebuff.
//
// Sends a message to every channel configured under `notifications` in
// .freebuff/omf.jsonc (project) or ~/.config/freebuff-omf/config.jsonc (user).
//
// Usage:
//   node hooks/notify.mjs "Build finished ✅"
//   echo "done" | node hooks/notify.mjs          # message from stdin
//   node hooks/notify.mjs                          # default message
//
// Wire it wherever your workflow can call a script on completion (a stop
// callback, a CI step, a git hook). It exits 0 even if a channel fails, so it
// never blocks the thing that called it — failures are printed to stderr.
import { sendNotification, resolveContext, paint, c } from '../bin/lib.mjs'

async function main() {
  let message = process.argv.slice(2).join(' ').trim()

  if (!message && !process.stdin.isTTY) {
    message = await new Promise((resolve) => {
      let data = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk) => (data += chunk))
      process.stdin.on('end', () => resolve(data.trim()))
    })
  }
  if (!message) message = 'oh-my-freebuff: task finished in {{projectName}}'

  const results = await sendNotification(message, resolveContext({}))

  if (results.length === 0) {
    console.error(
      paint(c.dim, 'notify: no channels configured — run `omf notify setup`'),
    )
    return
  }
  for (const r of results) {
    const mark = r.ok ? paint(c.green, '✓') : paint(c.red, '✗')
    const line = `${mark} ${r.channel}${r.detail ? ' — ' + r.detail : ''}`
    if (r.ok) console.log(line)
    else console.error(line)
  }
}

main().catch((e) => {
  console.error('notify error:', e.message)
  process.exit(0) // never block the caller
})
