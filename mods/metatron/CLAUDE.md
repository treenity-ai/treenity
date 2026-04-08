# metatron

Infrastructure module for AI agent system. Provides Claude SDK wrapper, permissions, and legacy types.

**Not a standalone service.** Metatron was the original orchestrator; that role is now in `mods/agent`. This module provides shared infrastructure consumed by the agent service and chat.

## What lives here

- `claude.ts` — `invokeClaude()` wrapper around Claude Agent SDK. Handles streaming, sessions, abort, structured `LogEntry[]` output, cost tracking.
- `permissions.ts` — Permission rule evaluation engine.
- `types.ts` — `MetatronSkill`, `MetatronTemplate` — legacy types kept for schema compat.
- `seed.ts` — Seeds `/metatron` as global AI assistant agent with chat capability.

## What was removed

- `MetatronConfig` — fields moved to `AiAgent` (model, systemPrompt) and `AiChat` (sessionId)
- Standalone service — replaced by `mods/agent/service.ts`
- Views — replaced by `mods/agent/views/`

## Key exports

- `invokeClaude(prompt, opts)` → `ClaudeResult { text, output, logEntries, sessionId, costUsd }`
- `abortQuery(key)` — abort a running query
- `MetatronSkill`, `MetatronTemplate` — registered types
