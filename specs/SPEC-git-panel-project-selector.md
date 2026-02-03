# SPEC: Git Panel Project Selector

## Summary

Extend the webchat git panel to support selecting which repository to operate on. Currently, all git commands run from the gateway's CWD. This adds a project/repo dropdown at the top of the git panel, auto-discovers nested git repos (like the payme-workspace which has root + payme-backend + payme-mobile), and passes the selected `cwd` to all git operations.

## Architecture

### Backend Changes (`src/gateway/server-methods/git.ts`)

1. **Add `cwd` parameter to `git()` helper**
   - Every git command already goes through the `git()` helper
   - Add optional `cwd` parameter, pass it to `execFileAsync` options
   - Security: validate that `cwd` exists and contains a `.git` directory

2. **New handler: `git.repos`**
   - Takes `{ roots?: string[] }` — directories to scan for git repos
   - Default roots: `[process.cwd()]`
   - Scans each root up to 3 levels deep for `.git` directories
   - Returns array of `{ path: string, name: string }` where `name` is the directory basename
   - For nested repos (like payme-workspace), returns both parent and children
   - Example response:
     ```json
     {
       "repos": [
         { "path": "/Users/aneyman/clawd", "name": "clawd" },
         { "path": "/Users/aneyman/repos/kinetic/active/payme-workspace", "name": "payme-workspace" },
         { "path": "/Users/aneyman/repos/kinetic/active/payme-workspace/payme-backend", "name": "payme-backend" },
         { "path": "/Users/aneyman/repos/kinetic/active/payme-workspace/payme-mobile", "name": "payme-mobile" }
       ]
     }
     ```

3. **All existing handlers accept optional `cwd` param**
   - `git.status`, `git.diff`, `git.log`, `git.stage`, `git.unstage`, `git.commit`, `git.discard`
   - Extract `cwd` from params, validate it, pass to `git()` helper
   - If no `cwd` provided, default to `process.cwd()` (current behavior)

4. **Register `git.repos` in server-methods.ts**
   - Add to the read-only methods list (no mutation)

### Frontend Changes

#### Controller (`ui/src/ui/controllers/git.ts`)

1. **New state fields:**
   ```ts
   gitRepos: Array<{ path: string; name: string }>;
   gitCwd: string;         // currently selected repo path
   gitReposLoading: boolean;
   ```

2. **New function: `loadGitRepos(state, roots?)`**
   - Calls `git.repos` with optional roots
   - Populates `state.gitRepos`
   - If `gitCwd` is empty, defaults to first repo (or process.cwd())

3. **All existing functions pass `state.gitCwd` as `cwd` param**
   - `loadGitStatus`, `loadGitLog`, `loadGitDiff`, `stageFiles`, `unstageFiles`, `commitChanges`, `discardFiles`

#### View (`ui/src/ui/views/git.ts`)

1. **New props:**
   ```ts
   repos: Array<{ path: string; name: string }>;
   selectedCwd: string;
   reposLoading: boolean;
   onRepoChange: (cwd: string) => void;
   ```

2. **Project selector UI** — positioned in the header area, between title and refresh button:
   - A `<select>` dropdown styled to match the panel
   - Shows repo `name` as display, `path` as value
   - Includes a tooltip showing the full path on hover
   - When changed, calls `onRepoChange` which updates `gitCwd` and refreshes status

3. **CSS additions:**
   - `.scm-repo-select` — styled select dropdown matching the panel theme

#### App View State (`ui/src/ui/app-view-state.ts`)

Add new fields:
```ts
gitRepos: Array<{ path: string; name: string }>;
gitCwd: string;
gitReposLoading: boolean;
```

#### App Render (`ui/src/ui/app-render.ts`)

Wire up the new props in the `renderGit()` call:
- Pass `repos`, `selectedCwd`, `reposLoading`
- `onRepoChange` callback: sets `state.gitCwd`, clears current status/diff/log, calls `loadGitStatus`

### Type Changes (`ui/src/ui/types.ts`)

Add:
```ts
export type GitRepoEntry = {
  path: string;
  name: string;
};
```

## Behavior

1. When git panel opens, it first calls `git.repos` to discover available repos
2. Default selection is the gateway's CWD (current behavior preserved)
3. User selects a different project → all git state resets and reloads for that repo
4. The selected repo persists in the panel state (resets on page reload — no localStorage needed for v1)
5. Branch name, ahead/behind, files, diff, log all reflect the selected repo

## Security

- Backend validates `cwd` is a real directory with a `.git` folder before executing
- No arbitrary path execution — must be a valid git repo
- The `git.repos` scan is bounded (maxDepth=3, skips node_modules/hidden dirs)

## Files to Modify

1. `src/gateway/server-methods/git.ts` — add cwd support + git.repos handler
2. `src/gateway/server-methods.ts` — register git.repos as read-only
3. `ui/src/ui/controllers/git.ts` — add repos state + pass cwd
4. `ui/src/ui/views/git.ts` — add project selector dropdown
5. `ui/src/ui/types.ts` — add GitRepoEntry type
6. `ui/src/ui/app-view-state.ts` — add new state fields
7. `ui/src/ui/app-render.ts` — wire up new props

## Default Scan Roots

For `git.repos`, use these as default scan roots:
- `process.cwd()` (gateway's working directory)

The UI could in the future allow configuring additional roots, but for v1, the user can pass `roots` explicitly, and we default to CWD.

Actually — to make this useful out of the box, have the backend also look at the parent directory of CWD (one level up) to discover sibling repos. So if CWD is `~/clawd`, it scans `~/clawd` itself AND `~/*` at depth 1 for other repos. This gives good auto-discovery.

**Revised default roots:** `[process.cwd(), path.dirname(process.cwd())]` — but only scan the parent at depth 1 (immediate children only), and CWD itself at depth 0 (just itself).

## Commit after initial changes

Make a WIP commit after the first pass of changes is working.
