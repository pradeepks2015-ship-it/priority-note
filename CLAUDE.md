# प्राथमिकता नोट (Priority Note)

A single-user tool for a Junior Engineer (JE) at an electricity distribution centre
(MPPKVVCL, Adegaon DC). The JE writes the day's work and senior-office instructions,
and the app turns them into a colourful sticky-note image (with date, time and the
attached letter screenshot) to post in the staff WhatsApp group or send to each
staff member. Staff never use the app; they only receive the note.

## Structure
- `index.html` — the whole app: markup, CSS and JS in one file, no build step.
- `manifest.webmanifest`, `icons/`, `sw.js` — installable PWA (home screen, opens offline).
  Bump `CACHE` in `sw.js` when the cached file list changes.
- `netlify.toml` — publish the repo root as-is; no build command.
- Live on GitHub Pages: https://pradeepks2015-ship-it.github.io/priority-note/ (deploys from `main`, root).
  `.nojekyll` keeps files untouched. Netlify project `priority-note1` is also linked but paused (team credits).
- No backend yet. Data lives in the browser:
  - `localStorage` key `priority-note-v2` — tasks, orders, staff, log, settings.
  - IndexedDB `priority-note-img`, store `img` — letter screenshots (blobs).

## Data model (state `S`)
- `tasks[]` / `orders[]` items: `{id, t, p (1 तुरंत | 2 आज दिन में | 3 समय मिले तो), w (staff name),
  st ('' | done | part | block), r (block reason), loc, due ("HH:MM"), ref, q (quoted line), img (image id), carry}`
- `staff[]`: `{id, n, m}` — `m` is a normalised 12-digit number starting with 91.
- `log[]`: last 25 sends/copies/photo saves with timestamp and message text.

## Key functions
- `model(mode, now, who)` builds the note as blocks; `renderNote()` draws it as HTML and
  `paint()` draws the same blocks on a canvas for the PNG. Change both together.
- `buildText()` / `personalText()` build the WhatsApp messages (`wa.me` links).
- `makeBlob()` renders the PNG and appends attached screenshots below the note.

## Conventions
- All UI text is Hindi (Devanagari). Keep it plain, short and in office vocabulary.
- Phone-first: test at 400px width; no horizontal scroll.
- Colours are CSS tokens on `:root` with dark-mode overrides; don't hard-code colours in components.
- Never put staff phone numbers, letters or real data in the repo.

## Run
Open `index.html` in a browser, or `npx serve .` and open the printed URL.

## Test
`tests/smoke.mjs` (Playwright) opens the app at 400px with sample tasks and checks the note
title, the signature, no "बनाया गया" line, PNG creation and no horizontal scroll. CI runs it on
every push (`.github/workflows/smoke.yml`). Locally: `python3 -m http.server 8080`, then
`node tests/smoke.mjs` (set `CHROMIUM_PATH` to use an installed Chromium). Update its checks when
the note text changes.

## Planned next steps
- Firebase (Auth, Firestore, Storage, Cloud Messaging) for sync and hourly reminders when the app is closed.
