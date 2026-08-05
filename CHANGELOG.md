# Changelog

## 0.1

Architecture set. One Node service serves the study page and the MCP endpoint on the same
port, with the agent doing every judgement and the service staying deterministic.

- Twelve boxes with one-way dependency edges, mapped in `docs/INDEX.md`.
- Session record, five-phase machine, and the live channel between page and agent.
- Tool surface with phase gates, and the rule that a live answer is text first.
- Artifact pipeline: static lint, esbuild bundle, verification inside the open page.
- Voice out and voice in as ports with three providers each.
- Build order in `docs/PLAN.md`, one box per step.
