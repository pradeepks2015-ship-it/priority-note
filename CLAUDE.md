# प्राथमिकता नोट (Priority Note)

A single-user tool for a Junior Engineer (JE) at an electricity distribution centre
(MPPKVVCL, Adegaon DC). The JE writes the day's work and senior-office instructions,
and the app turns them into a colourful sticky-note image (with date, time and the
attached letter screenshot) to post in the staff WhatsApp group or send to each
staff member. Staff never use the app; they only receive the note.

## Scope
JE-level only: two tabs, "आज के काम" and "स्टाफ़", and beside them a separate "🗺️ फीडर" button (feeder survey map, v1.28; own button since v1.29). The "निर्देश" (orders) and
"शाम की रिपोर्ट" tabs were removed at the user's request (v1.15); their code and saved data remain but are unreachable
and left out of reminders.

## Structure
- `index.html` — the whole app: markup, CSS and JS in one file, no build step.
- `lib/leaflet/` — Leaflet 1.9.4 (BSD-2, from npm), used only by the feeder tab and loaded when it opens; kept in the
  repo so it opens offline (in `sw.js` SHELL). Map pictures: OpenStreetMap / Esri satellite tiles (need internet, no key).
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
- "हर घंटे याद दिलाएँ": only the 🔔 button in the header toggles it; next-reminder time and the phone-notification
  status/button are in the 👤 panel. The "महीने का सारांश" card was removed (v1.34); `hist` is still counted. The staff tab shows only the staff list (no note or record); the feeder/DT/village list (`places`) is a folded card in the feeder view.
- Login/backup: the round 👤 profile button in the header (`#me`, Google photo or first letter when logged in)
  opens `#mePanel` with the cloud status, login and logout.
- Hourly reminder when the app is closed (project is on the Blaze plan): with "हर घंटे याद दिलाएँ" on and logged in,
  the app saves this phone's push token in `users/{uid}.fcm` (`rem: true`; all writes use `{merge:true}` so tokens
  stay). `.github/workflows/remind.yml` runs hourly 9–6 IST, `notify/send.mjs` (firebase-admin, key in the GitHub
  secret `FIREBASE_SA`) sends `notify/build.mjs`'s top-3 pending as a data-only message; `sw.js` shows it.
  GitHub may start scheduled runs late, and pauses them after 60 days without repo activity.

## Data model (state `S`)
- `tasks[]` / `orders[]` items: `{id, t, p (1 तुरंत | 2 आज दिन में | 3 समय मिले तो), w (staff name),
  st ('' | done | part | block), r (block reason), loc, due ("HH:MM"), ref, q (quoted line), img (image id), carry,
  no (instruction serial number; 0 for tasks), at (created, ms — drives "⏳ N दिन से बाकी")}`
- `ordNo`: last instruction serial number. It only goes up (new day, delete and "पूरे हुए हटाएँ" never
  reset it); shown as "No. 12 · …" on the card, the note, the PNG and the WhatsApp text.
- `tpl[]`: daily-work buttons ("रोज़ के काम"); `places[]`: feeder/DT/village list, filled from the स्थान field.
- `hist{'YYYY-MM': {ta, td, oa, od}}`: monthly counts (t=task, o=instruction; a=added, d=done), last 12 months.
  Change status only through `setSt()` so the counts stay right.
- `staff[]`: `{id, n, m, r, h}` — `m` is a normalised 12-digit number starting with 91; `r` = पद, `h` = मुख्यालय
  (older saves had `d` = "पद, स्थान", split by `splitRole()` on load). The staff tab is a contact list grouped by
  मुख्यालय with 💬 WhatsApp (pending work as text), 📞 `tel:` and 🖼️ sticker (share sheet); add/edit are folded away.
  "📋 कई स्टाफ़ एक साथ जोड़ें" (`parseStaffLines`) takes one person per line; same number updates that person.
  Excel (.xlsx) / CSV import for staff and places: `readSheet()` reads the first sheet itself (an .xlsx is a zip of XML;
  `DecompressionStream` + `DOMParser`, no library). Old binary .xls is not supported. Test files come from `tests/xlsx-fixture.mjs`.
- `log[]`: last 150 (`LOGMAX`) sends/photo saves with timestamp and message text (≤1500 chars). Each record's card is
  a ~10 KB JPEG (420px, `smallJpeg()`) in IndexedDB under `thId(l)` = 'L'+id, on this phone only (photos never sync).
  Made by `noteThumb()` at send time; records without one get it drawn once from the text (`textCard()`, `fillThumbs()`).
  The record view has a month picker and one folded group per date.

- `feeders[]`: `{id, n, poles (0 = use the estimate: GPS length / 65 m + 1), segs [[[lat,lng],…],…] (one per
  recording, 5 decimals), dts[], at}`; `dts[]`: `{id, n, kva, c (consumers), lt (LT line, m), lat, lng, img, note, at}`.
  GPS (`watchPosition`) adds a point only if accuracy ≤ 35 m, ≥ 8 m from the last and < 45 m/s (bike-speed jumps are
  noise). Screen wake lock while recording; a web page cannot record with the phone locked. DT photos stay on the phone.
  Shares a WhatsApp summary with `maps.google.com/?q=` links and a KML file (Google Earth / My Maps).

## Key functions
- `model(mode, now, who)` builds the note as blocks; `renderNote()` draws it as HTML and
  `paint()` draws the same blocks on a canvas for the PNG. Change both together.
- `buildText()` / `personalText()` build the WhatsApp messages (`wa.me` links).
- `mine(name)`: one person's work for their own card/WhatsApp — their tasks, or the common (सभी / अन्य) tasks
  when none is in their name.
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
monthly counts and staff open-work counts. CI runs it on
every push (`.github/workflows/smoke.yml`). Locally: `python3 -m http.server 8080`, then
`node tests/smoke.mjs` (set `CHROMIUM_PATH` to use an installed Chromium). `tests/cloud.mjs` checks the
online backup and push tokens across several "phones" with a stand-in Firebase (no real login needed);
`tests/notify.mjs` checks the reminder text and the 9–6 window. `tests/feeder.mjs` walks a stand-in GPS along a feeder
(length, skipped bad fixes, DT with photo, summary, KML). Update its checks when
the note text changes.

## Planned next steps
- Upload letter screenshots to Storage (needs the Blaze plan).
