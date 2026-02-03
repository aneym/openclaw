You are building kOS — an Electron + React desktop AI workspace app.

## Instructions

1. Read `CLAUDE.md` for full project context, tech stack, and architecture.
2. Read `.ralph/ralph-tasks.md` for the current task list.
3. Find the first uncompleted task (marked `- [ ]` or `- [/]`).
4. Read the relevant spec in `specs/` if referenced by the task.
5. If the task references a Linear PRD, read it: `~/clawd/skills/linear/scripts/linear.sh issue KOS-<N>`
6. Implement the task. Write clean, well-typed TypeScript + React code.
7. After implementation, run `npm run typecheck` to verify no type errors.
8. If typecheck fails, fix the errors before proceeding.
9. Mark the completed task as `- [x]` in `.ralph/ralph-tasks.md`.
10. Output READY_FOR_NEXT_TASK when the current task is done and typecheck passes.

## Rules

- **Only modify files inside `kos/`.** Read files outside for reference only.
- Use existing patterns: Zustand stores with persist, shadcn/ui components, Tailwind CSS v4, lucide-react icons.
- Add new shadcn components with `bunx shadcn@latest add <component>` when needed.
- Install npm packages with `npm install <pkg>` (from within kos/).
- Keep components small and focused. One component per file.
- Use the gateway client in `src/renderer/src/gateway/` for all backend communication.
- Study `../ui/src/` (the existing Lit.js web UI) for gateway protocol patterns when implementing real-time features.
- The renderer must work in a plain browser (no hard Electron dependencies in renderer code). Guard any `window.electron` access.
- Run `npm run typecheck` after every significant change.
- Commit your work with descriptive messages after completing each task.

## Completion

When ALL tasks in `.ralph/ralph-tasks.md` are marked `- [x]`, output COMPLETE.
