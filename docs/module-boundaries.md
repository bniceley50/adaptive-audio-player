# Module Boundaries

This repo is now large enough that future work needs clear ownership rules.
The goal is to keep route files thin, keep product logic reusable, and make it
safe for both humans and other AIs to extend the system without creating
spaghetti.

## Design goals

- Route files load data and choose sections to render.
- Product rules live in reusable feature modules.
- Storage and sync rules live behind repository-like helpers.
- Local/demo behavior is isolated from long-term production paths.
- Shared types are declared once and reused everywhere.

## Current layers

### 1. App routes

Location:
- `src/app/**`

Responsibilities:
- read route params and search params
- call server APIs or local helpers to build the initial page state
- render page-level sections
- pass normalized props into components

Should not:
- hold large blocks of domain logic long-term
- own storage precedence rules directly
- duplicate taste, playback, session, or render resolution logic

### 2. UI components

Location:
- `src/components/**`

Responsibilities:
- present data
- own interaction UI state
- call narrow actions/helpers

Should not:
- access SQLite directly
- implement sync policy
- redefine domain types ad hoc

### 3. Feature modules

Target location:
- `src/features/library/**`
- `src/features/player/**`
- `src/features/books/**`
- `src/features/jobs/**`
- `src/features/social/**`
- `src/features/auth/**`

Responsibilities:
- own feature-specific view-model builders
- hold feature constants, copy maps, and transformation helpers
- expose stable inputs/outputs to routes and components

Why:
- routes stay readable
- future AIs have obvious places to extend
- product logic becomes testable outside route files

### 4. Repositories and infrastructure

Location:
- `src/lib/backend/**`
- `src/lib/library/**`
- `src/lib/playback/**`
- `src/lib/jobs/**`
- `src/lib/import/**`
- `src/lib/types/repositories.ts`

Responsibilities:
- persistence
- sync
- session/auth primitives
- generated artifact storage metadata
- import and parsing

Should not:
- render UI copy
- encode page-specific branching

### 5. Demo and local-first support

Current locations:
- `src/components/library/demo-mode-card.tsx`
- local storage helpers under `src/lib/library/**` and `src/lib/playback/**`

Target rule:
- keep demo and local bootstrapping isolated so production storage can replace
  them without rewriting the product surface

## Boundary rules

### Route rule

Routes may:
- load data
- resolve params
- choose which feature module to call
- render sections

Routes should not:
- define long lists of product constants
- own cross-source precedence logic if that logic is reused elsewhere
- directly manipulate browser storage beyond a temporary bridge state

### Component rule

Components may:
- read props
- own small interaction state
- fire narrow callbacks

Components should not:
- talk to backend storage directly
- make product-wide source-of-truth decisions

### Storage rule

Storage helpers may:
- read/write local/browser state
- read/write backend state
- expose merge/precedence helpers
- implement repository interfaces from `src/lib/types/repositories.ts`

Storage helpers should not:
- format product copy
- decide route-specific CTAs

## Recommended target architecture

### Player

Move toward:
- `src/features/player/page-support.ts`
- `src/features/player/presets.ts`
- `src/features/player/render-state.ts`

### Books / setup

Move toward:
- `src/features/books/page-support.ts`
- `src/features/books/taste-resolution.ts`
- `src/features/books/render-summary.ts`

### Home / library

Move toward:
- `src/features/library/home-summary.ts`
- `src/features/library/reading-momentum.ts`
- `src/features/library/edition-sharing.ts`

### Jobs

Move toward:
- `src/features/jobs/history-summary.ts`
- `src/features/jobs/render-timeline.ts`

## Current priority hotspots

These route files are the best extraction targets because they are already
large and contain mixed responsibilities:

- `src/app/books/[bookId]/page.tsx`
- `src/app/player/[bookId]/page.tsx`
- `src/app/page.tsx`
- `src/app/jobs/page.tsx`

## Safe extension workflow for humans and AIs

1. Update or read `docs/data-contracts.md`
2. Identify the owning layer
3. Prefer editing a feature module before touching a route
4. Add or update unit coverage at the module boundary
5. Run:
   - `pnpm gate`
   - `pnpm build`
   - `pnpm test:e2e`

## Anti-spaghetti rules

- Do not add new storage precedence logic directly inside routes if a helper
  already exists or could be extracted.
- Do not create duplicate "book", "taste", or "artifact" types in page files.
- Do not let social features mutate playback or auth state directly.
- Do not let demo seeding become the only way a product feature works.
