# Changelog

## 0.1

A video becomes a study session. One Node process serves the page and speaks MCP on stdio, so
the CLI spawns it and there is nothing to start by hand.

- Thirteen boxes with one-way dependency edges, each built against its own contract and tested
  through its real entry point.
- Session record, five-phase machine, and a live channel carrying the page and the agent the
  same state.
- Transcripts from captions, the platform's transcript panel, a speech-recognition endpoint, or
  a file, normalized to sentences with every word kept exactly once.
- Twelve tools on stdio with phase gates, six prompt files, and the rule that a live answer is
  text first.
- Artifact pipeline: static lint, esbuild bundle, and verification inside the open page under a
  content policy derived from that document. The agent gets a snapshot back to look at.
- Voice out and voice in as ports with three providers each, browser first.
- Light, dark and system reaching the charts, sharp rectangles throughout.
- `observer mcp`, `observer serve`, `observer doctor`.
