# प्राथमिकता नोट (Priority Note)

A single-user tool for a Junior Engineer (JE) at an electricity distribution centre
(MPPKVVCL, Adegaon DC). The JE writes the day's work and senior-office instructions,
and the app turns them into a colourful sticky-note image (with date and time; the
attached letter screenshot goes as a separate photo with it) to post in the staff WhatsApp group or send to each
staff member. Staff never use the app; they only receive the note.

## Goal (JE, 31/10)
A village-wise and feeder-wise map of the whole distribution centre (11kV line, DTs, LT lines, poles, consumers per pole),
built by the linemen's field surveys (🗺️ फीडर). Free and fast, always (see Conventions).

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
  st ('' | done | part | block), r (block reason), loc, due ("HH:MM"), ref, q (quoted line), imgs (letter screenshot ids,
  up to 10; older saves had one `img`, moved into `imgs` by `cleanItem`), carry,
  no (instruction serial number; 0 for tasks), at (created, ms — drives "⏳ N दिन से बाकी")}`
- `tb`: an optional table with a task (v1.36), raw text: one row per line, cells split by tab (pasted from Excel) or
  `|`, first row the heading (`tbRows()`, max 30 rows × 8 columns). Shown on the note (`tbEl`), drawn on the PNG
  (`paintTb`) and in WhatsApp as one line per row (`tbLines`). "📍 मुख्यालय भरें" fills column 1 from the staff मुख्यालय.
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
- Village / pole survey (v1.41) in the same feeder entry: `pl[]` poles `{id, no, k ('h' 11kV | 'l' LT), c (consumers on an
  LT pole), to (the pole or DT it hangs from), lat, lng, note, at}`, `dts[].to` (the 11kV pole a DT hangs from), `by`
  (surveyor). A new pole's number is the next one; it joins the last pole of its kind (LT: the last LT pole or DT, else
  the nearest DT). Lines are drawn pole→`to` (11kV red, LT dark cable; the GPS track is a grey dashed line).
  Symbols (v1.44, small fixed SVG coloured by CSS tokens): `dtSym()` a transformer on its two-pole structure (always),
  `poleSym(k)` a pole with cross-arm and insulators plus its number; LT poles (v1.49, after the JE's drawing) show a short top arm, the cable on suspension hooks and, when `db`, a DB box
  with its service wire (no pin insulators). 11kV spans: `drawWires()` draws one red line (the JE asked for no R/Y/B,
  v1.49), one layer for all spans; LT is one dark cable layer. Poles have `db` (LT: DB box, checkbox in the form), counted in totals/SLD/WhatsApp — only when zoomed in (≥17) and only for poles in view (max 300). Search by pole
  number (`findPole`, `showFind`): consumers, its DT via `poleDt()`, poles further down via `below()`. Deleting a pole
  joins its children to its parent. "📤 सर्वे फ़ाइल" is the feeder as JSON in a .txt (shareable on WhatsApp, photos left
  out); "📥 सर्वे फ़ाइल जोड़ें" adds it (same id: asks, then replaces, keeping this phone's DT photos).
- Structures and SLD (v1.45): 11kV poles have `st` (pcc | dp | tp | 4p, `SLD_ST`), chosen in the pole form; map symbol
  (`strSym()`, v1.48, after the JE's DP drawing): H-beam poles, guarding channel with disc insulators, a second channel with
  pin insulators, belts and X-bracing (4-pole two pairs). TP (`tpSym()`, after the JE's photo) is three poles in an L that
  turns the line through 90°: two channels at a right angle, each with disc insulators and its own face of bracing. Its CSS class is `str` — `.st` is the app's round
  status-button style. Survey flow: "↩️ DT से 11kV आगे" sets the next 11kV pole's parent to the tapping pole of the DT
  last worked on; "🏁 सर्वे पूरा" sets `f.end` (field buttons hide; "↺ सर्वे फिर खोलें" reopens). `buildSld()` draws the
  single line diagram as SVG with DOM calls (text via textContent): title block, source, 11kV line with structures and
  "+N खंभे" for plain poles between (`sldLayout()`: shown = start, DT tap, structure, branch, end), DT taps (DO fuse +
  two-circle transformer, kVA) with the LT sum, branch lanes, `///` on each 11kV span (3 wires, `sldTicks`), legend (wraps). Print colours `SLDC` are fixed (white paper in
  dark mode too). "📐 SLD (PDF / प्रिंट)" prints only `#sldPrint` (A3 landscape → Save as PDF); "🖼️ SLD फोटो" draws it
  on a canvas (≤ 8000 px wide) and shares a PNG.

## Key functions
- `model(mode, now, who)` builds the note as blocks; `renderNote()` draws it as HTML and
  `paint()` draws the same blocks on a canvas for the PNG. Change both together.
- `buildText()` / `personalText()` build the WhatsApp messages (`wa.me` links).
- `mine(name)`: one person's work for their own card/WhatsApp — their tasks, or the common (सभी / अन्य) tasks
  when none is in their name.
- `makeBlob()` renders the note PNG; `letterFiles()` gives the letter screenshots, shared as separate photos with it in
  one share (v1.38). `model()` numbers them in note order (photo 1 is the note; `b.from`–`b.to`), the note says
  "पत्र: फोटो नं. 2 से 4 में", and `letterCard()` puts a strip with the photo number and task on each. In the app the
  lightbox steps through a task's screenshots with ‹ › or a swipe (`openImg(ids, i)`).

## Conventions
- **Free and fast, always (user's standing rule, esp. the survey).** No paid service, no API key, nothing billed per use:
  free map tiles (OpenStreetMap / Esri) with attribution, Leaflet kept in `lib/`, Firebase only within its free quota.
  Check speed with a big survey (thousands of poles) before shipping map work: the map uses the canvas renderer
  (`preferCanvas`), pole numbers are drawn only for poles in view when zoomed in (`drawLabels`, max 300), the network is
  indexed once per change (`net()`), and search only moves the highlight ring (`drawHl`), not the whole map.
  (v1.42: 1500 poles open in ~0.2 s, search ~0.04 s; 5000 poles ~0.4 s.) The whole state is one Firestore document
  (1 MB limit): about 5000 poles is ~420 KB, so very large surveys may need their own documents later.
- All UI text is Hindi (Devanagari). Keep it plain, short and in office vocabulary.
- Phone-first: test at 400px width; no horizontal scroll.
- Colours are CSS tokens on `:root` with dark-mode overrides; don't hard-code colours in components.
- Never put staff phone numbers, letters or real data in the repo.

## Every change (the ADEGAON repo's process — follow strictly)
1. Test first where it fits (a failing test that shows the bug or the new behaviour), then the code, then green.
   Look at each change with a security eye: XSS (data only through `textContent`/`mk()`, or `xmlEsc()` into HTML),
   new outside addresses (CSP), personal data in logs/files, Firebase rules.
2. Before every push all of these must pass (`npm ci` once; the server: `python3 -m http.server 8080`):
   ```
   npm run fix-csp        # after any index.html change: refresh the inline-script hash in the CSP
   npm run checks         # lint (ESLint + no-unsanitized), lint:css (stylelint), check-css (colours only from tokens,
                          # every var() defined), check-xss (no inline on…=, map HTML through xmlEsc), check-csp,
                          # check-actions (workflow actions pinned to a commit SHA), npm audit --audit-level=high
   APP_URL=http://127.0.0.1:8080/ npm test   # notify, smoke, cloud, feeder, xss (live XSS attack on every input)
   ```
   CI (`.github/workflows/smoke.yml`) runs the same in two jobs, `lint` and `smoke`; both must be green.
3. Raise the version (below), commit, push to the branch and `main`, then check CI on GitHub and tell the JE.
4. CSP (`tests/csp.mjs`): the app may only load/connect to the listed addresses; inline script is allowed by its
   sha256 hash, not 'unsafe-inline'. A new outside address (script, fetch, picture, iframe) goes into `POLICY` there.
   Tests fail on any "Content Security Policy" console message.
5. New dev tool versions: at least two weeks old (supply-chain safety), exact versions in `package.json`.

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
(length, skipped bad fixes, DT with photo, summary, KML, poles and pole search, survey file in/out). Update its checks when
the note text changes.

## Planned next steps
- Upload letter screenshots to Storage (needs the Blaze plan).
