# Product and Technical Spec

## Summary

Adaptive Audio Player is a private AI audiobook player for imported books and documents. The first release is focused on the shortest path from upload to listening: import a file, parse chapters, choose a narrator and listening mode, generate a sample, and press play.

## Goals

- Reach first play in under 5 minutes
- Support private imports for common book and document types
- Make playback feel like a real audiobook app, not a utility panel

## Non-goals

- Massive licensed catalog
- DRM bypass
- Full-cast production in v1

## Users and primary journeys

- Power audiobook listeners
- Ebook readers
- Accessibility-first listeners

Primary journey:
1. Import a file
2. Review chapter parsing
3. Choose narrator and listening mode
4. Generate a sample
5. Listen in the player

## UX and UI direction

- Mobile-first
- Player-first, settings second
- Warm editorial presentation over generic dashboard chrome

## Functional requirements

- Import `epub`, `pdf`, `docx`, and `txt`
- Parse chapters from extracted text
- Support one narrator in the first vertical slice
- Support `Classic`, `Ambient`, and `Immersive` modes
- Render a sample player view

## Data model

- User
- Book
- Chapter
- NarrationProfile
- PlaybackPreference

## Security and privacy

- Imports are private by default
- Validate import type before processing
- No DRM circumvention

## Risks and open questions

- Import quality across file types
- TTS latency vs first-play expectations
- How much ambience is tasteful in longer sessions

## Acceptance criteria

- A user can navigate the core routes
- The parser returns stable chapter output for basic input
- The smoke e2e path loads the home page and import entry point
