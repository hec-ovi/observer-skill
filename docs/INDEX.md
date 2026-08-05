# Index

Start here. Open one box, read its `CONTRACT.md`, change its folder, run its tests.

| Need | Read |
|---|---|
| Hector's raw idea | [IDEA.md](IDEA.md) |
| Every request, raw and in order | [REQUIREMENTS.md](REQUIREMENTS.md) |
| How the whole thing fits together | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What it is built on and why | [DECISIONS.md](DECISIONS.md) |
| Build order, step by step | [PLAN.md](PLAN.md) |

## Boxes

| Box | Purpose | Depends on |
|---|---|---|
| [`session`](../boxes/session/CONTRACT.md) | The session record, phase machine, event bus, disk persistence | none |
| [`ingest`](../boxes/ingest/CONTRACT.md) | A URL becomes a source: provider, video id, title, duration | none |
| [`transcript`](../boxes/transcript/CONTRACT.md) | A source becomes timed segments and a lookup by second | `ingest` |
| [`knowledge`](../boxes/knowledge/CONTRACT.md) | Concepts, jargon, research notes, artifact bindings | `session` |
| [`artifact`](../boxes/artifact/CONTRACT.md) | Artifact source becomes a checked, bundled module | none |
| [`web-host`](../boxes/web-host/CONTRACT.md) | HTTP: app build, REST face, SSE live channel, `/mcp` mount | `session` |
| [`agent-io`](../boxes/agent-io/CONTRACT.md) | MCP tools, prompts, phase gates, the error set | `session`, `ingest`, `transcript`, `knowledge`, `artifact`, `web-host` |
| [`app`](../boxes/app/CONTRACT.md) | Page shell: phases, layout, theme, settings | `web-host` |
| [`app/player`](../boxes/app/player/CONTRACT.md) | Video port and its YouTube provider; position and state | none |
| [`app/stage`](../boxes/app/stage/CONTRACT.md) | Artifact runtime, registry, transitions, verify sandbox | none |
| [`app/voice-out`](../boxes/app/voice-out/CONTRACT.md) | Say a line: Pocket TTS in browser, speechSynthesis, endpoint | none |
| [`app/voice-in`](../boxes/app/voice-in/CONTRACT.md) | Hold to talk: browser recognition, whisper-web, endpoint | none |
| [`app/dialogue`](../boxes/app/dialogue/CONTRACT.md) | Transcript rail, question box, answer log, loaders | `app/stage`, `app/voice-out`, `app/voice-in` |

Dependency edges run one way and never loop. `agent-io` is the only box that touches
several others: it is the agent's face onto all of them. The `app/*` boxes know the page
they mount into and `web-host`'s HTTP shape, nothing more.

## Surfaces

| Surface | Where |
|---|---|
| Skill instructions (canonical) | `skills/observer/SKILL.md` + `references/` |
| Root skill copy | `SKILL.md` (synced by `scripts/sync-skill-copies.ts`) |
| Claude plugin | `plugins/observer/` |
| MCP registry entry | `server.json` |
| Local MCP wiring | `.mcp.json` |
| CLI entry | `bin/observer` |
