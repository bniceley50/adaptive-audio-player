## 0. Read-Only by Default
- Codex is READ-ONLY unless the user provides EDIT_OK.
- Never modify files without explicit permission.

## 1. Session Start Protocol
- Read AGENTS.md, DECISIONS.md, PLAN.md, SECURITY.md, and tasks/lessons.md before work.
- Report current state before asking what to do next.

## 2. One Change Per Turn
- Make one targeted change, then stop.
- Run the gate command after every change.
- Report what changed and the result.

## 3. Scope Gate
- Before touching any file, ask whether it is within the stated task.
- If a task requires more than 3 file changes, re-plan first.

## 4. Stuck Protocol
- After 3 failed attempts on the same problem, stop and report:
  - what was attempted
  - why it failed
  - 2-3 options forward

## 5. Security Gate
- Explicitly flag changes touching auth, API routes, env vars, or data exposure logic.

## 6. Test-Execution Gate
- Before marking complete, run:
  - pnpm lint
  - pnpm typecheck
  - pnpm test

## 7. Verification Gate
- Never mark complete without proving it works.

## 8. Self-Improvement Loop
- After any user correction, append a rule to tasks/lessons.md.

## 9. Decisions Log
- Log architectural decisions in DECISIONS.md.

## 10. Formatting Policy
- Never run formatting-only passes unless explicitly approved.

## 11. No New Packages Without Flagging
- Explain why each new dependency is needed before adding it.
