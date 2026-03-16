# Product Reset Plan

_Last updated: March 15, 2026_

## Phase 1: Clarify the product

Goal:
- make the app understandable in 10 seconds

Tasks:
- rewrite home around one primary CTA
- demote advanced/system surfaces from default home
- rename first-run labels to plain language
- move `Jobs` and similar backend concepts out of the casual-user path

Definition of done:
- home clearly says what the app is
- there is one dominant starting action
- internal jargon is gone from first-run surfaces

## Phase 2: Fix the title and player flow

Goal:
- make the core listening loop feel like a real audiobook app

Tasks:
- redesign the book detail screen around `Play` / `Resume`
- simplify the player controls above the fold
- collapse adaptive/taste controls into advanced sections
- make chapter navigation, speed, timer, and bookmarks the visible defaults

Definition of done:
- a user can move from title to playback without interpretation work
- the player’s primary controls are obvious

## Phase 3: Simplify import

Goal:
- reduce decision load before playback

Tasks:
- create a 3-path source chooser:
  - sample
  - text
  - personal audio
- keep roadmap language below working import actions
- reduce nonessential sync/backend copy on import

Definition of done:
- the import page feels like intake, not a prototype control center

## Phase 4: Reposition community

Goal:
- keep community valuable without making it the main job

Tasks:
- rename social objects in the UI
- move community emphasis from home hero areas into secondary sections
- keep trending, groups, and highlights as optional discovery surfaces
- preserve durable routes, but frame them as exploration

Definition of done:
- users can ignore community and still succeed
- community still feels alive when intentionally visited

## Phase 5: Visual system cleanup

Goal:
- make the interface readable, intentional, and trustworthy

Tasks:
- establish contrast-safe button styles
- reduce card count and repeated chrome
- tighten spacing and hierarchy
- define a smaller set of reusable layout patterns

Definition of done:
- no low-contrast actions
- no ambiguous primary buttons
- fewer competing cards on each screen

## Phase 6: Validate with real flows

Goal:
- confirm the redesign solves comprehension problems

Tasks:
- test with a new-user sample-book path
- test with a bring-your-own-text path
- test with a personal-audio import path
- test with a returning-user resume path
- document remaining confusion points with browser screenshots

Definition of done:
- the top 5 confusion points are removed or reduced

## Recommended implementation order

1. home reset
2. import reset
3. book detail reset
4. player reset
5. community reframing
6. polish and validation
