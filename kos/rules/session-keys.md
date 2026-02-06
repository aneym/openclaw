# Session Key Comparison

Session keys have multiple canonical forms. The gateway returns fully-qualified keys (e.g. `agent:main:kos:thread:abc`) while local code may use bare keys (e.g. `kos:thread:abc`). These refer to the same session.

**Always use `sessionKeysMatch()` from `@/lib/session-keys` to compare session keys. Never use `===` or `!==`.**

```typescript
// WRONG — breaks when gateway returns canonical form
if (sessionKey !== existing.sessionKey) { ... }
if (chat.sessionKey === sessionKey) { ... }

// CORRECT
import { sessionKeysMatch } from '@/lib/session-keys'
if (!sessionKeysMatch(sessionKey, existing.sessionKey)) { ... }
if (sessionKeysMatch(chat.sessionKey, sessionKey)) { ... }
```

This applies everywhere session keys are compared: stores, hooks, components, and utilities.
