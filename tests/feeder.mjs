// Feeder map: walking along a feeder with a stand-in GPS draws the line and measures it, rough or jumpy
// fixes are skipped, a transformer is marked with its details and photo, and the summary/KML carry it all.
// Map pictures are replaced by a blank tile, so no internet is needed.
// Run like smoke.mjs: serve the repo root, then APP_URL=http://127.0.0.1:8080/ node tests/feeder.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.env.APP_URL || 'http://127.0.0.1:8080/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: 22.5, longitude: 79.2, accuracy: 5 }, acceptDownloads: true });
await ctx.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
await ctx.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('priority-note-ver', '99'); });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// anything the app's Content-Security-Policy blocks counts as an error
page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) errors.push('CSP: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(url);

await page.click('#tab-feeder');
const noteHidden = await page.$eval('#noteCol', (n) => n.hidden);
const nameBoxH = await page.$eval('#fdName', (n) => n.getBoundingClientRect().height);
await page.fill('#fdName', 'नमूना फीडर');
await page.click('#fdNew button[type=submit]');
const mapReady = await page.waitForSelector('#fdMap.leaflet-container', { timeout: 8000 }).then(() => true, () => false);

// Walk north in 30 m steps, one per second; a rough fix and a 1 km jump in between must be skipped.
const at = (k, acc = 5) => ctx.setGeolocation({ latitude: 22.5 + k * 0.00027, longitude: 79.2, accuracy: acc });
await page.click('#fdRec');
await page.waitForTimeout(1100);
for (const [k, acc] of [[1], [2], [2.5, 120], [3], [40], [4], [5]]) { await at(k, acc); await page.waitForTimeout(1100); }
const recStat = await page.$eval('#fdStat', (n) => n.innerText);
await page.click('#fdRec');
const len = await page.evaluate(() => {
  const f = JSON.parse(localStorage.getItem('priority-note-v2')).feeders[0];
  const R = 6371000, r = Math.PI / 180; let m = 0;
  f.segs.forEach((s) => { for (let i = 1; i < s.length; i++) { const a = s[i - 1], b = s[i]; const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; m += 2 * R * Math.asin(Math.sqrt(h)); } });
  return { m, pts: f.segs.flat().length };
});
const lineDrawn = await page.evaluate(() => { let n = 0; window.__fdMap.eachLayer((l) => { if (l instanceof L.Path && !(l instanceof L.CircleMarker && l.options.fill === false)) n++; }); return n; });

// Mark a transformer here, with details and a photo.
await page.click('#fdDt');
await page.waitForSelector('#dtForm:not([hidden])');
const dtName = await page.inputValue('#dtN');
await page.selectOption('#dtKva', '63');
await page.fill('#dtC', '45');
await page.fill('#dtLt', '820');
await page.setInputFiles('#dtPhoto', { name: 'dt.png', mimeType: 'image/png', buffer: PNG });
await page.waitForSelector('#dtPrev img', { timeout: 5000 }).catch(() => {});
await page.click('#dtForm button[type=submit]');
await page.waitForTimeout(300);
const dtList = await page.$eval('#dtList', (n) => n.innerText);
const dtThumb = await page.$$eval('#dtList img.thumb', (i) => i.length);
const dtMarker = await page.$$eval('#fdMap .dtico', (m) => m.map((x) => x.textContent));
const poleHint = await page.$eval('#fdPoles', (n) => n.placeholder);
await page.fill('#fdPoles', '7');
await page.press('#fdPoles', 'Tab');
const sum = await page.$eval('#fdSum', (n) => n.innerText.replace(/\s+/g, ' '));
const wa = decodeURIComponent(await page.$eval('#fdWa', (a) => a.href));
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fdKml')]);
const kml = readFileSync(await dl.path(), 'utf8');
// Village survey: an 11kV pole, then two LT poles fed from the DT; the line joins up by itself.
await page.fill('#fdBy', 'नमूना लाइनमैन');
await page.press('#fdBy', 'Tab');
await page.click('#fdPoleH');
await page.waitForSelector('#plForm:not([hidden])');
const hNo = await page.inputValue('#plNo');
const stShown = await page.$eval('#plSt', (n) => !n.hidden);
await page.click('#plSt [data-s="dp"]');
await page.click('#plForm button[type=submit]');
await page.click('#fdPoleL');
await page.waitForSelector('#plForm:not([hidden])');
const lTo1 = await page.$eval('#plTo', (s) => s.options[s.selectedIndex].text);
const lNo1 = await page.inputValue('#plNo');
await page.fill('#plC', '6');
await page.click('#plForm button[type=submit]');
await page.click('#fdPoleL');
await page.waitForSelector('#plForm:not([hidden])');
const lNo2 = await page.inputValue('#plNo');
const lTo2 = await page.$eval('#plTo', (s) => s.options[s.selectedIndex].text);
await page.fill('#plC', '4');
await page.click('#plForm button[type=submit]');
// A pole straight from the DT starts the next LT circuit: the number follows the chosen "किससे जुड़ा".
await page.click('#fdPoleL');
await page.waitForSelector('#plForm:not([hidden])');
await page.selectOption('#plTo', { label: '⚡ DTR-1' });
const lNoCkt2 = await page.inputValue('#plNo');
await page.click('#plCancel');
// The DT hangs from the 11kV pole.
await page.click('#dtList [aria-label="बदलें: DTR-1"]');
await page.selectOption('#dtTo', { label: '🔴 खंभा HT-1' });
await page.click('#dtForm button[type=submit]');
// Pole number search.
await page.fill('#plQ', 'Ckt-1-2');
await page.click('#plFind button[type=submit]');
const find3 = await page.$eval('#plInfo', (n) => n.innerText);
const findIcons = await page.$eval('#plInfo', (n) => ({ dtr: n.querySelectorAll('svg.dtsym').length, db: n.querySelectorAll('svg .db').length, pole: n.querySelectorAll('b svg.psym').length }));
await page.fill('#plQ', 'ckt 1 1');
const find2 = await page.$eval('#plInfo', (n) => n.innerText);
await page.fill('#plQ', '99');
await page.click('#plFind button[type=submit]');
const find99 = await page.$eval('#plInfo', (n) => n.hidden);
const sum2 = await page.$eval('#fdSum', (n) => n.innerText.replace(/\s+/g, ' '));
const dtList2 = await page.$eval('#dtList', (n) => n.innerText);
const poleDots = await page.evaluate(() => { let n = 0; window.__fdMap.eachLayer((l) => { if (l instanceof L.Path && !(l instanceof L.CircleMarker && l.options.fill === false)) n++; }); return n; });
// Pole symbols with numbers only when zoomed in (big surveys stay quick); the DT has its transformer symbol.
await page.evaluate(() => window.__fdMap.setView([22.5 + 5 * 0.00027, 79.2], 18));
await page.waitForTimeout(400);
const iconsNear = await page.$$eval('#fdMap .plico', (e) => e.map((x) => x.innerText.trim()).sort());
const dbIcons = await page.$$eval('#fdMap .plico svg .db', (e) => e.length);
const dbWin = await page.$$eval('#fdMap .plico svg .dbw', (e) => e.length);
// LT pole: the cable on one hook, on one side only (the JE removed the left one).
const ltSide = await page.$$eval('#fdMap .plico svg.l', (e) => e.map((x) => [x.querySelector('.cb').getAttribute('d'), x.querySelector('.hk').getAttribute('d')].join('').split('M').length - 1));
// The DP structure symbol: bracing drawn, and no round border from the app's other '.st' style.
const dpSym = await page.$$eval('#fdMap .plico svg.str', (e) => e.map((x) => ({ br: x.querySelectorAll('.br').length, dsc: x.querySelectorAll('.dsc').length, radius: getComputedStyle(x).borderTopLeftRadius })));
const phases = () => page.evaluate(() => { const w = []; window.__fdMap.eachLayer((l) => { if (l.options && l.options.phase) w.push(l.options.phase); }); return w.sort().join(','); });
const wiresNear = await phases();
// Zoomed in, the cable hangs at the top of the pole symbols (the hook), not along the pole's foot; far out it joins the points.
const wireTop = () => page.evaluate(() => { const f = JSON.parse(localStorage.getItem('priority-note-v2')).feeders[0]; const p = f.pl.find((x) => x.k !== 'h' && x.to); let w = null; window.__fdMap.eachLayer((l) => { if (l.options && l.options.phase === 'LT') w = l.getLatLngs()[0][0]; }); const z = window.__fdMap, a = z.latLngToContainerPoint([p.lat, p.lng]), b = z.latLngToContainerPoint(w); return Math.round(a.y - b.y); });
const liftNear = await wireTop();
// 11kV poles are steel-coloured, so they stand out from the red 11kV line (symbol, structure and the dot at the foot).
// The plain 11kV PCC pole is drawn like the LT pole (same pole colour), keeping its pin insulators.
const pccLikeLt = await page.evaluate(() => { const box = document.createElement('div'); box.innerHTML = '<svg class="psym h pcc"><rect class="po"/><circle class="in"/></svg><svg class="psym l"><rect class="po"/></svg><svg class="psym h str"><rect class="po"/></svg>'; document.body.appendChild(box); const f = (q) => getComputedStyle(box.querySelector(q)).fill; const r = { pcc: f('.pcc .po'), lt: f('.l .po'), str: f('.str .po'), pin: f('.pcc .in') }; box.remove(); return r.pcc === r.lt && r.str !== r.lt && r.pin !== r.pcc; });
const hvColours = await page.evaluate(() => { const red = getComputedStyle(document.documentElement).getPropertyValue('--p1').trim(); const sym = [...document.querySelectorAll('#fdMap .plico svg.h .po')].map((e) => getComputedStyle(e).fill); const dots = []; window.__fdMap.eachLayer((l) => { if (l instanceof L.CircleMarker && l.options.fill !== false && l.options.k === 'h') dots.push(l.options.fillColor); }); const toRgb = (h) => { const n = parseInt(h.slice(1), 16); return 'rgb(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')'; }; return { n: sym.length, symRed: sym.some((c) => c === toRgb(red)), dots: dots.length, dotRed: dots.some((c) => c.toLowerCase() === red.toLowerCase()) }; });
await page.evaluate(() => window.__fdMap.setZoom(14));
await page.waitForTimeout(400);
const iconsFar = await page.$$eval('#fdMap .plico', (e) => e.length);
const wiresFar = await phases();
const liftFar = await wireTop();
const dtSymOk = await page.$$eval('#fdMap .dtico svg .tk', (e) => e.length);
// DTR as in the JE's picture: two poles, bushings, tank on a plinth, fencing; 1.5× size on the map.
const dtrPic = await page.$$eval('#fdMap .dtico svg', (e) => e.map((x) => ({ bo: x.querySelectorAll('.bo').length, fe: x.querySelectorAll('.fe').length, w: Math.round(x.getBoundingClientRect().width) })));
const wa2 = decodeURIComponent(await page.$eval('#fdWa', (a) => a.href));
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#fdKml')]);
const kml2 = readFileSync(await dl2.path(), 'utf8');
// Survey file out, and back in on the list page (same survey: asks, then replaces; a copy with a new id: added).
const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('#fdExp')]);
const survey = readFileSync(await dl3.path(), 'utf8');
// LT circuit done: "↩️ DT से 11kV आगे" makes the next 11kV pole continue from DTR-1's tapping pole (pole 1).
await page.click('#fdBackH');
await page.click('#fdPoleH');
await page.waitForSelector('#plForm:not([hidden])');
const backTo = await page.$eval('#plTo', (s) => s.options[s.selectedIndex].text);
const hNo2 = await page.inputValue('#plNo');
await page.click('#plForm button[type=submit]');
// End of the survey: field buttons go, status says so.
await page.click('#fdEnd');
const ended = await page.evaluate(() => ({ end: JSON.parse(localStorage.getItem('priority-note-v2')).feeders[0].end, st: JSON.parse(localStorage.getItem('priority-note-v2')).feeders[0].pl[0].st, poleBtn: document.getElementById('fdPoleH').hidden, stat: document.getElementById('fdStat').innerText, endBtn: document.getElementById('fdEnd').innerText }));
// SLD: printed (PDF) and as a picture.
await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; window.__sld = document.getElementById('sldPrint').innerHTML; }; });
await page.click('#fdSldPdf');
await page.waitForFunction(() => window.__printed > 0, null, { timeout: 3000 }).catch(() => {});
const sldSvg = await page.evaluate(() => window.__sld || '');
const [dl4] = await Promise.all([page.waitForEvent('download'), page.click('#fdSldPng')]);
const sldPng = { name: dl4.suggestedFilename(), size: readFileSync(await dl4.path()).length };
const uiDtr = await page.evaluate(() => { const t = document.getElementById('feederCard').innerText + document.getElementById('dtN').placeholder; return t.includes('↩️ DTR से 11kV आगे') && !/\bDT\b/.test(t); });
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

// Saved: after reopening, the feeder is in the list with its length and transformer.
await page.reload();
await page.click('#tab-feeder');
const listTxt = await page.$eval('#fdItems', (n) => n.innerText);
await page.setInputFiles('#fdImp', { name: 'survey.txt', mimeType: 'text/plain', buffer: Buffer.from(survey) });
await page.waitForTimeout(300);
const afterSame = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.length);
const other = JSON.parse(survey); other.f.id = 'copy1'; other.f.n = 'नमूना गाँव (लाइनमैन)';
other.f.pl.forEach((p, i) => { p.no = String(i + 1); });  // a file from before the HT / Ckt numbering
other.f.dts.forEach((d) => { d.n = 'DT-1'; });  // and from before DT was called DTR
await page.setInputFiles('#fdImp', { name: 'survey2.txt', mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify(other)) });
await page.waitForTimeout(300);
const imported = await page.evaluate(() => { const F = JSON.parse(localStorage.getItem('priority-note-v2')).feeders; return F.map((f) => f.n + ':' + f.pl.length + ':' + f.by); });
const oldDt = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.find((f) => f.id === 'copy1').dts.map((d) => d.n).join(','));
const oldNos = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.find((f) => f.id === 'copy1').pl.map((p) => p.no).sort().join(','));
// After a reload the map is new: the 11kV line must be there as soon as the saved feeder opens.
await page.click('#fdItems [aria-label="खोलें: नमूना फीडर"]');
await page.waitForTimeout(500);
const wiresReopen = await phases();
// "🔢 नंबर फिर से लगाएँ": numbers in survey order, the same as they already are.
await page.click('#fdOne details.more summary');
await page.click('#fdRenum');
await page.click('#fdOne details.more summary');
const renum = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.find((f) => f.n === 'नमूना फीडर').pl.map((p) => p.no).join(','));
await page.click('#fdBack');
await page.waitForTimeout(200);
await page.setInputFiles('#fdImp', { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
await page.waitForTimeout(200);
const listTxt2 = await page.$eval('#fdItems', (n) => n.innerText);
await page.click('#fdItems [aria-label="खोलें: नमूना फीडर"]');
await page.waitForSelector('#fdMap .dtico', { timeout: 8000 }).catch(() => {});
const reopened = await page.$$eval('#fdMap .dtico', (m) => m.length);
await page.$eval('#fdOne details.more', (d) => { d.open = true; });
await page.click('#fdDelete');
const gone = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.length === 1);

await browser.close();
const checks = {
  'फीडर टैब में नोट वाला हिस्सा छिपा': noteHidden,
  'फीडर के नाम का खाना सामान्य ऊँचाई का': nameBoxH < 70,
  'नक्शा खुला': mapReady,
  'चलते समय "नाप रहे हैं"': recStat.includes('नाप रहे हैं'),
  'लंबाई ~150 मी. (कमज़ोर GPS और 1 km की छलाँग छोड़ी)': len.m > 140 && len.m < 160 && len.pts === 6,
  'नक्शे पर रास्ता बना': lineDrawn >= 1,
  'ट्रांसफार्मर का नाम अपने-आप DTR-1': dtName === 'DTR-1',
  'ट्रांसफार्मर सूची में kVA, उपभोक्ता, LT': dtList.includes('DTR-1') && dtList.includes('63 kVA') && dtList.includes('45 उपभोक्ता') && dtList.includes('LT 820 मी.'),
  'ट्रांसफार्मर की फोटो': dtThumb === 1,
  'नक्शे पर ट्रांसफार्मर का निशान': dtMarker.length === 1 && dtMarker[0].includes('DTR-1'),
  'खंभों का अनुमान (150 मी. → लगभग 3)': poleHint === 'लगभग 3',
  'सारांश में लिखे खंभे और कुल': sum.includes('खंभे 7') && sum.includes('उपभोक्ता (DTR पर लिखे) 45') && sum.includes('63 kVA'),
  'WhatsApp सारांश में लंबाई और नक्शे का लिंक': wa.includes('*नमूना फीडर*') && /लंबाई \(GPS से\): 1[45]\d मी\./.test(wa) && wa.includes('https://maps.google.com/?q=22.50') && wa.includes('खंभे: 7'),
  'KML फ़ाइल में रास्ता और DT': kml.includes('<LineString>') && kml.includes('<name>DTR-1</name>') && kml.includes('79.2,22.5'),
  'खंभा नंबर अपने-आप: 11kV HT-1, HT-2; LT Ckt-1-1, Ckt-1-2; DT से नया सर्किट Ckt-2-1': hNo === 'HT-1' && hNo2 === 'HT-2' && lNo1 === 'Ckt-1-1' && lNo2 === 'Ckt-1-2' && lNoCkt2 === 'Ckt-2-1',
  'पुरानी फ़ाइल के 1, 2, 3 नंबर नए ढंग में': oldNos === 'Ckt-1-1,Ckt-1-2,HT-1',
  'पुराना नाम DT-1 अब DTR-1; बटन व संकेत में DTR': oldDt === 'DTR-1' && uiDtr,
  '"🔢 नंबर फिर से लगाएँ" वही क्रम': renum === 'HT-1,Ckt-1-1,Ckt-1-2',
  'LT खंभा पहले DT से, फिर पिछले LT खंभे से जुड़े': lTo1.includes('DTR-1') && lTo2.includes('खंभा Ckt-1-1'),
  'खंभा 3 खोजने पर: 4 उपभोक्ता, DTR-1, बीच में 1 खंभा, DB बॉक्स': find3.includes('DB बॉक्स: लगा है') && find3.includes('खंभा Ckt-1-2') && find3.includes('उपभोक्ता: 4') && find3.includes('DTR-1') && find3.includes('बीच में 1 खंभे'),
  'खंभा 2: आगे 1 खंभा (4 उपभोक्ता)': find2.includes('उपभोक्ता: 6') && find2.includes('आगे जुड़े खंभे: 1 (उन पर 4 उपभोक्ता)'),
  'न मिला नंबर: कुछ न दिखे': find99,
  'कुल: 1 11kV, 2 LT खंभे, 10 उपभोक्ता, 2 DB बॉक्स': sum2.includes('11kV खंभे (सर्वे) 1') && sum2.includes('LT खंभे (सर्वे) 2') && sum2.includes('खंभों पर उपभोक्ता 10') && sum2.includes('DB बॉक्स 2'),
  'DT के नीचे उसके LT खंभे और उपभोक्ता': dtList2.includes('LT खंभे 2 · खंभों पर 10 उपभोक्ता'),
  'नक्शे पर खंभे और लाइनें': poleDots >= 3 + 3 + 1,
  'ज़ूम पर खंभों के निशान+नंबर, दूर से नहीं; DT पर ट्रांसफार्मर का निशान; LT खंभे पर DB बॉक्स': iconsNear.join(',') === 'Ckt-1-1,Ckt-1-2,HT-1 DP' && iconsFar === 0 && dtSymOk === 1 && dbIcons === 2,
  'WhatsApp सारांश में खंभे और सर्वे करने वाला': wa2.includes('11kV खंभे: 1 · 🔵 LT खंभे: 2 · खंभों पर उपभोक्ता: 10') && wa2.includes('सर्वे: नमूना लाइनमैन'),
  'KML में खंभे': kml2.includes('<name>खंभा Ckt-1-2 (DTR-1)</name>') && kml2.includes('#ll'),
  'सर्वे फ़ाइल: वही सर्वे बदला, नया जुड़ा, गलत फ़ाइल नहीं': afterSame === 1 && imported.length === 2 && imported.every((x) => x.endsWith(':3:नमूना लाइनमैन')) && listTxt2.includes('नमूना गाँव (लाइनमैन)'),
  'खंभे की बनावट (DP) चुनी और सेव': stShown && ended.st === 'dp',
  '"↩️ DT से 11kV आगे": अगला 11kV खंभा DT के टैप खंभे (1) से': backTo.includes('खंभा HT-1'),
  '"🏁 सर्वे पूरा": खंभे वाले बटन छिपे, स्थिति में पूरा': ended.end > 0 && ended.poleBtn && ended.stat.includes('सर्वे पूरा') && ended.endBtn.includes('फिर खोलें'),
  'SLD प्रिंट (PDF): शीर्षक, DP, DT, LT का हिसाब, संकेत': ['एकल रेखा आरेख (SLD)', 'नमूना फीडर', '(DP)', 'DTR-1', 'LT केबल: 2 खंभे', '10 उपभोक्ता', 'संकेत:', 'वितरण ट्रांसफार्मर', 'सर्वे पूरा'].every((t) => sldSvg.includes(t)),
  '11kV एक लाल लाइन (पास, दूर और दोबारा खोलने पर), LT केबल अलग': wiresNear === 'H,LT' && wiresFar === 'H,LT' && wiresReopen === 'H,LT',
  'SLD में /// तीन तार, LT केबल, DB बॉक्स': ['/// = तीन तार', 'LT केबल', 'DB 2'].every((x) => sldSvg.includes(x)),
  'LT खंभे पर केबल और हुक सिर्फ़ एक तरफ़': ltSide.length === 2 && ltSide.every((n) => n === 2),
  'पास से केबल खंभे के हुक पर (नीचे नहीं), दूर से बिंदु पर': liftNear === 20 && liftFar === 0,
  '11kV PCC खंभा LT खंभे जैसा, पिन इंसुलेटर वही': pccLikeLt,
  '11kV खंभे का रंग लाल लाइन से अलग (स्टील)': hvColours.n > 0 && !hvColours.symRed && hvColours.dots > 0 && !hvColours.dotRed,
  'नक्शे पर DTR चित्र वाला (बाड़, डेढ़ गुना); बिजली वाला सिर्फ़ पेज पर': dtrPic.length === 1 && dtrPic[0].fe === 1 && dtrPic[0].bo === 0 && dtrPic[0].w === 66,
  'खोज वाले डिब्बे में DTR, DB बॉक्स और खंभे के निशान': findIcons.dtr >= 1 && findIcons.db >= 1 && findIcons.pole >= 1,
  'DB बॉक्स चित्र जैसा (खिड़की वाला)': dbWin === 2,
  'DP का निशान: ब्रेसिंग और डिस्क इंसुलेटर, गोल किनारा नहीं': dpSym.length === 1 && dpSym[0].br === 1 && dpSym[0].dsc === 3 && dpSym[0].radius === '0px',
  'SLD फोटो (PNG) बनी': /^sld-.*\.png$/.test(sldPng.name) && sldPng.size > 5000,
  'आड़ा स्क्रॉल नहीं': !hScroll,
  'दोबारा खोलने पर फीडर सूची में': listTxt.includes('नमूना फीडर') && listTxt.includes('1 ट्रांसफार्मर') && reopened === 1,
  'फीडर हटाना (पूछकर)': gone,
  'कोई JS error नहीं': errors.length === 0,
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) { console.log((pass ? 'PASS ' : 'FAIL ') + name); if (!pass) ok = false; }
if (!ok) console.log(JSON.stringify({ len, recStat, dtList, dtMarker, poleHint, sum, wa, listTxt, errors }, null, 1));
process.exit(ok ? 0 : 1);
