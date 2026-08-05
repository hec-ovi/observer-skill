/**
 * Put the study page in front of the user. A machine with no way to open a browser is not a
 * failed session: the page URL comes back from `open` either way.
 */

import { spawn } from 'node:child_process'
import { report } from './report.ts'

function opener(): { command: string; args: string[] } {
  if (process.platform === 'darwin') return { command: 'open', args: [] }
  if (process.platform === 'win32') return { command: 'cmd', args: ['/c', 'start', ''] }
  return { command: 'xdg-open', args: [] }
}

export function openInBrowser(url: string): void {
  const { command, args } = opener()
  try {
    const child = spawn(command, [...args, url], { stdio: 'ignore', detached: true })
    child.on('error', (error) => report('browser', error))
    child.unref()
  } catch (error) {
    report('browser', error)
  }
}
