# Product Reset Spec

_Last updated: March 15, 2026_

## Why this exists

The current app has strong engineering depth, but the product story is unclear on first use.
Users have to learn too many internal concepts before they reach value.

This reset defines the simpler product the UI should communicate.

## Core product statement

Adaptive Audio Player helps people bring in a book, press play quickly, and optionally shape how the audiobook sounds.

That means the product priority order is:

1. Listen to a book
2. Tune the listening experience
3. Explore shared listening paths

The UI should reflect that order everywhere.

## Competitor teardown

Official product references:

- [Apple Books audiobook playback](https://support.apple.com/guide/iphone/listen-to-audiobooks-iphac1971248/ios)
- [Apple Books buying flow](https://support.apple.com/guide/iphone/buy-books-and-audiobooks-iphab21972d/ios)
- [Libro.fm Android app guide](https://blog.libro.fm/app-guide/android-app/)
- [Libro.fm web player](https://blog.libro.fm/new-web-player/)
- [Libby bookmarks and highlights](https://help.libbyapp.com/6165.htm)
- [Libby filters](https://help.libbyapp.com/en-us/6064.htm)
- [Audible how to listen](https://www.audible.com/ep/howtolisten)
- [Audible next-gen experience notes](https://www.audible.com/about/newsroom/enhancing-the-audible-experience-with-next-gen-tech)
- [Spotify audiobooks in Premium](https://support.spotify.com/us/article/audiobooks-premium-plans/)
- [BookPlayer App Store page](https://apps.apple.com/lc/app/bookplayer/id1138219998)

### What these products consistently do well

- They make the book the main object, not the system.
- They make `Play` or `Resume` the primary action.
- They keep the player model familiar:
  - cover
  - progress
  - chapter list
  - speed
  - sleep timer
  - bookmark
- They delay advanced concepts until after the user has a title in progress.

### What our current app does worse

- Home presents too many nouns before value:
  - edition
  - circle
  - moment
  - social
  - studio
- The first-run path is not obvious enough.
- The social layer is more visible than the core listening loop deserves.
- The app looks like a builder console in places where users expect a book product.

### What our current app does better

- Bring-your-own-content flexibility
- Strong backend/session/sync model for a prototype
- More ambitious tuning/customization than standard audiobook players
- Early foundation for social listening paths

## Target user

Primary user:
- someone who wants to listen to their own book or text quickly

Secondary user:
- someone who wants to customize voice/style after basic playback works

Tertiary user:
- someone curious about shared listening editions, circles, and public moments

## Product principles

1. Book first
- The title is the main object.

2. Playback before customization
- The user should hear audio before seeing advanced tuning options.

3. Plain language over internal language
- Use user words first.

4. Discovery is supportive, not dominant
- Social and community should help users choose or return, not overwhelm first use.

5. One primary action per screen
- Every screen needs an obvious next step.

## Terms to change

Current term -> preferred default label

- `Edition` -> `Listening version`
- `Circle` -> `Book club` or `Listening group`
- `Moment` -> `Highlight`
- `Studio` -> `Advanced controls`

Internal terms can remain in code. They should not be first-run user language.

## New information architecture

Top level:

- Home
- Library
- Import
- Player
- Community
- Account

Rules:

- `Home` is the start screen and return screen
- `Player` is where the user spends time
- `Community` is secondary navigation, not a default focus
- `Jobs` and backend visibility move under advanced/account areas unless directly needed

## New first-run flow

### Home

The first screen should ask only one practical question:

`How do you want to start listening?`

Primary CTA:
- `Start with a sample book`

Secondary CTA:
- `Bring your own text or audio`

Tertiary CTA:
- `Explore community picks`

### Import

The import screen should split clearly:

- `Paste text`
- `Upload a text file`
- `Upload personal audiobook files`

Do not front-load roadmap content or backend state above the working path.

### Book detail

The book page should show:

- title
- cover or placeholder art
- listening progress
- one main CTA:
  - `Play`
  - or `Resume`
- chapter list
- a small `Listening options` panel

Advanced tuning stays collapsed.

### Player

The player should default to:

- play/pause
- skip back / skip forward
- progress bar
- chapter jump
- speed
- sleep timer
- bookmark

Adaptive/taste controls should sit under a secondary section.

### Community

Community should be framed as optional:

- trending listening versions
- active book clubs
- highlights

It should feel like exploration, not required setup.

## Questions the product must answer

These questions should drive every redesign decision:

1. What is the main object: book, player, or network?
2. What should a new user do in the first 10 seconds?
3. How many clicks until audio starts?
4. Which concepts can be hidden until after first successful playback?
5. What does a returning user most likely want to resume?
6. Which labels are understandable without explanation?
7. What would make someone come back tomorrow?

## Non-goals for the next UI pass

- Adding more social objects
- Expanding backend dashboards
- Showing every advanced capability on home
- Explaining the whole system on the first screen

## Acceptance criteria

- A first-time user can explain what the app is in one sentence.
- A first-time user can start listening in under 30 seconds using the sample path.
- The main CTA on home is unambiguous.
- The player reads like a normal audiobook player.
- Community features remain accessible but no longer dominate the first-run experience.
