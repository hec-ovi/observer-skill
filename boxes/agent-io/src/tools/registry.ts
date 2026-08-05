/**
 * Every tool the agent sees, in the order a session moves through them. The phase table is
 * read off this list, so a tool that declares no phase is legal nowhere.
 */

import type { Tool } from '../tool.ts'
import { build } from './build.ts'
import { concepts } from './concepts.ts'
import { hide } from './hide.ts'
import { link } from './link.ts'
import { note } from './note.ts'
import { open } from './open.ts'
import { ready } from './ready.ts'
import { say } from './say.ts'
import { show } from './show.ts'
import { status } from './status.ts'
import { transcript } from './transcript.ts'
import { wait } from './wait.ts'
import { where } from './where.ts'

export const TOOLS: readonly Tool[] = [
  open,
  status,
  transcript,
  concepts,
  note,
  build,
  link,
  ready,
  wait,
  where,
  say,
  show,
  hide,
]
