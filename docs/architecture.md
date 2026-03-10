# Architecture

## App shape

- Next.js App Router frontend
- Mobile-first route set for library, import, book setup, and player
- Local parser and validation modules for the first vertical slice

## Core modules

- `src/lib/import`
- `src/lib/parser`
- `src/lib/narration`
- `src/lib/ambience`
- `src/lib/playback`
- `src/lib/jobs`
- `src/lib/validation`

## Planned evolution

- Add background jobs for generation
- Add persistent storage for books and playback state
- Add account-backed ownership and private asset delivery
