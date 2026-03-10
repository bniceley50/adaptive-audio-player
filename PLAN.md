# Plan

## Product

Adaptive audiobook player for private imports and opt-in catalog titles.

## Positioning

Choose how your audiobook sounds.

## Milestone 1

- Import file
- Parse chapters
- Review import
- Pick narrator
- Pick listening mode
- Generate sample
- Play sample

## Milestone 2

- Chapter list
- Bookmarks
- Sleep timer
- Continue listening
- Saved preferences

## Backend Foundation

- Anonymous workspace session via secure cookie
- SQLite-backed workspace library snapshot
- Sync API for books, drafts, tastes, playback, and defaults
- Home-page backend sync visibility

## Account Foundation

- Server-backed user records
- Email/display-name sign-in on home
- Account cookie and workspace-to-user linking
- Signed-in account visibility on the home screen
- Linked workspace switching and latest-book recovery
- Direct book/player route restore from backend snapshots

## First Vertical Slice

Upload one file, parse it into chapters, choose a narrator and mode, generate one sample chapter, and play it.

## Backend Jobs

- Workspace sync job history
- Sample-generation job recording
- Home-page recent backend activity
- Manual sync trigger
- Real background worker for sample/full-book generation
- Status-only UI polling against queued/running/completed job state
- Generated audio asset persistence and streaming
- Live OpenAI TTS when configured, deterministic mock audio otherwise
