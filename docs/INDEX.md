# Index

Start here. Open one box, read its `CONTRACT.md`, change its folder, run its tests.

| Need | Read |
|---|---|
| Hector's raw idea | [IDEA.md](IDEA.md) |
| Every request, raw and in order | [REQUIREMENTS.md](REQUIREMENTS.md) |
| How the whole thing fits together | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What it is built on and why | [DECISIONS.md](DECISIONS.md) |
| Build order and what is left | [PLAN.md](PLAN.md) |

## Boxes

| Box | Purpose | Depends on |
|---|---|---|
| [`session`](../boxes/session/CONTRACT.md) | The session record, phase machine, event inbox, subscriber bus, disk | none |
| [`ingest`](../boxes/ingest/CONTRACT.md) | A URL becomes a source: id, title, duration, publish date, captions, embeddable | none |
| [`transcript`](../boxes/transcript/CONTRACT.md) | A source becomes timed sentences and a lookup by second | `ingest` |
| [`knowledge`](../boxes/knowledge/CONTRACT.md) | Concepts, jargon, research notes, artifact bindings | `session` |
| [`artifact`](../boxes/artifact/CONTRACT.md) | Artifact source becomes a checked, bundled module | none |
| [`web-host`](../boxes/web-host/CONTRACT.md) | HTTP: app build, REST face, SSE live channel, the verify frame | `session` |
| [`agent-io`](../boxes/agent-io/CONTRACT.md) | MCP tools on stdio, prompts, phase gates | every box above |
| [`app`](../boxes/app/CONTRACT.md) | Page shell: screens, layout, theme, settings, the live channel client | `web-host` |
| [`app/player`](../boxes/app/player/CONTRACT.md) | The video port and its YouTube provider; position and state | none |
| [`app/stage`](../boxes/app/stage/CONTRACT.md) | Artifact runtime, library registry, transitions, the verify frame | none |
| [`app/voice-out`](../boxes/app/voice-out/CONTRACT.md) | Say a line: Pocket TTS in browser, speechSynthesis, endpoint | none |
| [`app/voice-in`](../boxes/app/voice-in/CONTRACT.md) | Hold to talk: browser recognition, whisper-web, endpoint | none |
| [`app/dialogue`](../boxes/app/dialogue/CONTRACT.md) | Transcript rail, question box, answer log | `app/stage`, `app/voice-*` |

Edges run one way and never loop. `agent-io` is the only box that touches several: it is the
agent's face onto all of them. A box reaches another only through the `imports` map in
`package.json` (`#session`, `#transcript`, and so on), so a deep import is not expressible.

## Cross-cutting

| Thing | Where |
|---|---|
| The closed error set, with its HTTP statuses | `shared/errors.ts` |
| Every environment variable, read once | `shared/config.ts` |
| The CLI: `mcp`, `serve`, `doctor` | `bin/observer.ts` |
| What this machine can run, and what to install | `bin/doctor.ts` |
| The publish build | `scripts/build.ts` |
| Skill copies, and the drift check | `scripts/sync-skill-copies.ts` |

## Surfaces

| Surface | Where |
|---|---|
| The agent's instructions (canonical) | `skills/observer/SKILL.md` + `references/` |
| The prompts the agent works from | `boxes/agent-io/prompts/` |
| Root skill copy, for a plain checkout | `SKILL.md` (synced) |
| Claude plugin | `plugins/observer/` (synced) |
| Marketplace entry | `.claude-plugin/marketplace.json` |
| MCP registry entry | `server.json` |
| Local MCP wiring | `.mcp.json` |

## Running it

```
node --run test        every box's tests, server then browser
node --run typecheck   both TypeScript projects
node bin/observer.ts doctor
node bin/observer.ts mcp
```
