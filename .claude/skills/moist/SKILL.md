---
name: moist
description: Audit for duplication, abstraction health, AI maintainability
argument-hint: <file-or-feature>
allowed-tools: Read, Glob, Grep, Task
---

## Philosophy: MOIST Code

**MOIST = Meaningful Overlap Is Sometimes Tolerable**

The goal is balance between extremes:

| Extreme     | Problem                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| **Too DRY** | Premature abstractions, coupled code, hard to modify                                   |
| **Too WET** | Copy-paste bugs, inconsistent behavior, maintenance burden                             |
| **MOIST**   | Intentional duplication where it aids clarity; abstractions that earn their complexity |

### The Rule of Three

- **1-2 occurrences**: Keep duplicated. Abstraction costs more than repetition.
- **3+ occurrences**: Consider abstraction, but only if the use cases are truly the same.
- **"Almost the same"**: Often better as separate implementations than a parameterized mess.

## Instructions

### Step 1: Identify the Target

Parse `$ARGUMENTS` to determine what to audit:

- **File path**: Audit that specific file
- **Feature name**: Search for related files (e.g., "notifications" -> find all notification-related code)
- **Directory**: Audit all files in that directory

If unclear, ask the user to clarify.

### Step 2: Gather Code Context

Read the target file(s). For features, use Glob and Grep to find related code:

```
# Example patterns
src/gateway/*.ts, src/agents/*.ts (gateway/runtime)
ui/src/ui/*.ts, ui/src/ui/views/*.ts (Lit.js web UI)
src/telegram/*.ts, src/discord/*.ts (channels)
extensions/*/*.ts (channel plugins)
```

### Step 3: Analyze for Issues

Check each category and report findings:

#### A. Duplication Analysis

| Pattern                             | Verdict    | Action                                 |
| ----------------------------------- | ---------- | -------------------------------------- |
| Identical code blocks (3+ times)    | Too WET    | Extract to shared utility              |
| Similar code with minor differences | Often fine | Document why they differ               |
| Copy-pasted with parameter changes  | Risky      | Consider if abstraction helps or hurts |

**Look for:**

- Repeated API call patterns
- Duplicate validation logic
- Copy-pasted error handling
- Similar UI components with slight variations

#### B. Abstraction Health

| Smell                                  | Problem                 | Fix                          |
| -------------------------------------- | ----------------------- | ---------------------------- |
| Single-use abstraction                 | Premature               | Inline it                    |
| Abstraction with many parameters/flags | Over-engineered         | Split into focused functions |
| "Utils" file over 200 lines            | Dumping ground          | Split by domain              |
| Wrapper that just passes through       | Unnecessary indirection | Remove wrapper               |
| Generic name (handleData, processItem) | Unclear purpose         | Rename or split              |

**Check for:**

- Functions with boolean parameters that change behavior dramatically
- Classes/hooks that do too many things
- Abstractions created "for future flexibility" that never materialized

#### C. AI Maintainability

| Issue                        | Problem for AI          | Fix                         |
| ---------------------------- | ----------------------- | --------------------------- |
| File > 500 lines             | Hard to hold in context | Split by responsibility     |
| No comments explaining "why" | AI will guess wrong     | Add context comments        |
| Magic numbers/strings        | Unclear intent          | Extract to named constants  |
| Implicit dependencies        | Hidden coupling         | Make dependencies explicit  |
| Complex conditionals         | Easy to misread         | Extract to named predicates |

**Check for:**

- Would a new AI agent understand this in 30 seconds?
- Are the file's responsibilities clear from its name?
- Could someone modify this without breaking something unexpected?

### Step 4: Generate Report

Structure your findings as:

```markdown
## MOIST Audit: [Target]

### Summary

[One-line verdict: Too DRY / Too WET / Nicely MOIST / Mixed]

### Duplication Findings

[List issues with file:line references]

### Abstraction Health

[List over/under-abstractions]

### AI Maintainability

[List clarity issues]

### Recommendations

[Prioritized list of suggested changes]
```

### Step 5: Offer to Fix

After presenting the report, ask:

> "Would you like me to address any of these issues?"

If yes, prioritize:

1. High-impact, low-effort fixes first
2. Splitting large files
3. Inlining premature abstractions
4. Adding "why" comments

---

## Examples

### Good MOIST Patterns

```typescript
// GOOD: Duplication is fine when contexts differ
// user-notifications.ts
function sendUserNotification(userId: string, message: string) {
  // User-specific logic: check preferences, rate limits
}

// admin-notifications.ts
function sendAdminNotification(adminId: string, message: string) {
  // Admin-specific logic: no rate limits, different channels
}
// These LOOK similar but have different requirements. Don't force-merge them.
```

```typescript
// GOOD: Abstraction that earned its place (used 5+ times)
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
```

### Bad Patterns to Flag

```typescript
// BAD: Premature abstraction (used once)
function processUserData<T extends UserLike>(
  data: T,
  options: ProcessOptions = {},
): ProcessedData<T> {
  // 50 lines of "flexible" code for one use case
}

// BETTER: Just write the specific code you need
function updateUserProfile(profile: UserProfile): UpdatedProfile {
  // Direct, clear implementation
}
```

```typescript
// BAD: Abstraction with behavioral flags
function fetchData(url: string, useCache: boolean, retryOnFail: boolean) {
  if (useCache) {
    /* 20 lines */
  }
  if (retryOnFail) {
    /* 30 lines */
  }
  // ...
}

// BETTER: Separate functions
function fetchWithCache(url: string) {}
function fetchWithRetry(url: string) {}
```

$ARGUMENTS
