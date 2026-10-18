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
- Data lives in the browser, with an optional online copy (below):
  - `localStorage` key `priority-note-v2` — tasks, orders, staff, log, settings.
  - IndexedDB `priority-note-img`, store `img` — letter screenshots (blobs).

- Online backup (Firebase project `priority-note-467fa`, Spark/free plan): Google login, then the whole
  state `S` is stored as a JSON string in Firestore `users/{uid}` (`{s, t, v}`). The SDK (10.12.5 from
  gstatic) loads only after the first login (`localStorage` `priority-note-fb`). Newer `S._t` wins; first
  login on a phone with data on both sides asks which to keep. Letter screenshots are not uploaded.
  Security rules: `firestore.rules` (paste into Firestore → Rules). The web config in `index.html` is public by design.

## Data model (state `S`)
- `tasks[]` / `orders[]` items: `{id, t, p (1 तुरंत | 2 आज दिन में | 3 समय मिले तो), w (staff name),
  st ('' | done | part | block), r (block reason), loc, due ("HH:MM"), ref, q (quoted line), img (image id), carry,
  no (instruction serial number; 0 for tasks), at (created, ms — drives "⏳ N दिन से बाकी")}`
- `ordNo`: last instruction serial number. It only goes up (new day, delete and "पूरे हुए हटाएँ" never
  reset it); shown as "No. 12 · …" on the card, the note, the PNG and the WhatsApp text.
- `tpl[]`: daily-work buttons ("रोज़ के काम"); `places[]`: feeder/DT/village list, filled from the स्थान field.
- `hist{'YYYY-MM': {ta, td, oa, od}}`: monthly counts (t=task, o=instruction; a=added, d=done), last 12 months.
  Change status only through `setSt()` so the counts stay right.
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

## Version (after every fix)
- Raise `APP_V` in `index.html`, list the change in `APP_NOTES` (short Hindi), and put the same
  `v` in `version.json`. CI fails if `index.html`/`sw.js` change without a new `version.json`.
- On first open after an update the app shows an orange "✅ ऐप अपडेट हुआ" banner with `APP_NOTES`.
  While the app is open it checks `version.json` (on return to the app and every 30 min) and
  shows "🆕 नया संस्करण … आ गया है" with an "अपडेट करें" button. `sw.js` never caches `version.json`.

## Test
`tests/smoke.mjs` (Playwright) opens the app at 400px with sample tasks and checks the note
title, the date shown once, the signature, no "बनाया गया" line, PNG creation, no horizontal scroll, the update banner
and instruction "No." numbering, daily-work buttons, pending days, places list,
monthly summary and staff open-work counts. CI runs it on
every push (`.github/workflows/smoke.yml`). Locally: `python3 -m http.server 8080`, then
`node tests/smoke.mjs` (set `CHROMIUM_PATH` to use an installed Chromium). `tests/cloud.mjs` checks the
online backup across several "phones" with a stand-in Firebase (no real login needed). Update its checks when
the note text changes.

## Planned next steps
- Hourly reminders when the app is closed: Cloud Messaging + a scheduled function (needs the Blaze plan).
- Upload letter screenshots to Storage (needs the Blaze plan).
