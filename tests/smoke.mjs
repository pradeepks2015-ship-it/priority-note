// Smoke test: opens the app at phone width and checks the note and the PNG.
// Run: serve the repo root (python3 -m http.server 8080), then
//   APP_URL=http://127.0.0.1:8080/ node tests/smoke.mjs
// Uses made-up sample tasks only — never real staff data.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { makeXlsx } from './xlsx-fixture.mjs';

const url = process.env.APP_URL || 'http://127.0.0.1:8080/';
const fileV = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8')).v;
const MONTHS = JSON.parse(readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/var MONTHS=(\[[^\]]+\])/)[1].replace(/'/g, '"'));
const appV = (readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/APP_V='([^']+)'/) || [])[1];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.addInitScript(() => {
  const T = (id, t) => ({ id, t, p: 1, w: '', st: '', r: '', loc: '', due: '', ref: '', q: '', img: '', carry: false });
  localStorage.setItem('priority-note-v2', JSON.stringify({
    // 'a' was added 3 days ago and is still open; 'b' is given to a sample staff member.
    tasks: [{ ...T('a', 'नमूना काम एक'), at: Date.now() - 3 * 864e5 }, { ...T('b', 'नमूना काम दो'), w: 'नमूना कर्मचारी' }],
    // Instructions saved before serial numbers existed (no `no` field).
    orders: [T('o1', 'नमूना निर्देश एक'), { ...T('o2', 'नमूना निर्देश दो'), p: 2 }],
    staff: [{ id: 's1', n: 'नमूना कर्मचारी', m: '' }],
    // An older record from last month with only the message text (no small photo).
    log: [{ id: 'old', ts: Date.now() - 35 * 864e5, lbl: 'ग्रुप में भेजा · काम', tot: 1, done: 0, txt: '⚡ *आज के प्राथमिकता वाले कार्य*\n🕒 सुबह 9:00 बजे\n\n🔴 नमूना पुराना काम' }], color: 'yellow', sign: 'JE', remind: false,
  }));
  // Pretend the phone last ran an older version, so the "updated" banner should show.
  if (!sessionStorage.getItem('smoke')) { localStorage.setItem('priority-note-ver', '0.9'); sessionStorage.setItem('smoke', '1'); }
  // Note when the PNG canvas is turned into a file.
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    window.__pngSize = this.width * this.height;
    return toBlob.call(this, cb, ...a);
  };
});

await page.goto(url);
await page.waitForSelector('#note');
const note = await page.$eval('#note', (n) => n.innerText);
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const verLabel = await page.$eval('#ver', (n) => n.innerText);
const updTitle = await page.$eval('#upd', (n) => (n.hidden ? '' : n.innerText));
await page.click('#updBtn');
const updClosed = await page.$eval('#upd', (n) => n.hidden);
const updSaved = await page.evaluate(() => localStorage.getItem('priority-note-ver'));

// A newer version.json on the server should bring up the "new version" banner.
// Wait until the service worker controls the page: a check made while it is taking over can get lost (first open only).
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
});
// Routed on the context, so it also catches the request when the service worker already controls the page.
await page.context().route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: '{"v":"99.0"}' }));
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForFunction(() => !document.getElementById('upd').hidden, null, { timeout: 5000 }).catch(() => {});
const newTitle = await page.$eval('#upd', (n) => (n.hidden ? '' : n.innerText));
await page.context().unroute('**/version.json*');

await page.click('#img');
await page.waitForFunction(() => window.__pngSize > 0, null, { timeout: 15000 });
// The record keeps a small JPEG of the card instead of a "copy message" button.
await page.waitForFunction(() => !!document.querySelector('#logBody img.card-th'), null, { timeout: 8000 }).catch(() => {});
// Record: month list, newest month first; older month shows the card drawn from its message.
const logMonths = await page.$$eval('#logMonth option', (o) => o.length);
const oldKey = await page.$$eval('#logMonth option', (o) => o[o.length - 1].value);
await page.click('#logSum');
await page.selectOption('#logMonth', oldKey);
await page.waitForFunction(() => !!document.querySelector('#logBody img.card-th'), null, { timeout: 8000 }).catch(() => {});
const oldCard = await page.evaluate(async () => {
  const i = document.querySelector('#logBody img.card-th'); if (!i) return null;
  const blob = await (await fetch(i.src)).blob(), bmp = await createImageBitmap(blob);
  return { type: blob.type, kb: blob.size / 1024, w: bmp.width };
});
await page.click('#logBody img.card-th');
const oldOpens = await page.$eval('#lb', (l) => !l.hidden);
await page.click('#lbClose');
await page.selectOption('#logMonth', await page.$$eval('#logMonth option', (o) => o[0].value));
const logThumb = await page.evaluate(async () => {
  const i = document.querySelector('#logBody img.card-th'); if (!i) return null;
  const blob = await (await fetch(i.src)).blob(), bmp = await createImageBitmap(blob);
  return { type: blob.type, kb: blob.size / 1024, w: bmp.width };
});

// JE-level app: only "आज के काम" and "स्टाफ़" tabs.
const tabs = await page.$$eval('.tabs .tab', (t) => t.map((x) => x.innerText.trim()));

// Daily-work button fills the text; a place typed once is offered next time.
await page.click('#tab-tasks');
await page.click('#tplRow >> text=बकाया वसूली');
const tplFilled = await page.inputValue('#txt');
await page.evaluate(() => { document.getElementById('loc').value = 'नमूना फीडर'; });
await page.press('#txt', 'Enter');
const placeOffered = await page.$$eval('#placeList option', (o) => o.map((x) => x.value));
const micOk = await page.$eval('#mic', (b) => b.hidden || b.textContent.includes('🎤'));
const remCardGone = !(await page.$('#remCard')) && !(await page.$('#remSw'));
await page.click('#bell');
const bellOn = await page.$eval('#bell', (b) => b.getAttribute('aria-pressed') === 'true' && b.textContent === '🔔')
  && await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).remind === true);
await page.click('#bell');
// Edit and delete daily-work buttons right where they are used.
await page.click('#tplEdit');
page.once('dialog', (d) => d.accept('मीटर रीडिंग की जाँच'));
await page.click('#tplRow >> [aria-label="बदलें: मीटर रीडिंग"]');
await page.click('#tplRow >> [aria-label="हटाएँ: फीडर पेट्रोलिंग"]');
await page.click('#tplDone');
const tplNow = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).tpl);
const tplChips = await page.$eval('#tplRow', (n) => n.innerText);

// Monthly summary (staff tab) counts what was added today; staff tab shows open work.
await page.click('#tab-staff');
const monFolded = await page.$eval('#monCard', (d) => !d.open);
const mon = await page.$eval('#monBox', (n) => n.textContent);
// Bulk add: made-up names and numbers only. The existing sample person's number updates that person.
await page.click('#addStaffBox summary');
await page.click('#bulkBox summary');
await page.fill('#bulkTxt', 'नमूना एक — 9000000001 — मीटर रीडर, नमूना गाँव\nनमूना दो 90000 00002 आउटसोर्स हेल्पर\nबिना नंबर वाली लाइन\nनमूना कर्मचारी पूरा नाम, +91 9000000003, LA');
await page.click('#bulkAdd');
const bulk = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).staff);
// Same number again with a new name: that person is updated, not added twice.
await page.click('#bulkBox summary');
await page.fill('#bulkTxt', 'नमूना एक बदला नाम 9000000001');
await page.click('#bulkAdd');
const bulk2 = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).staff);
// Excel file: heading row and serial numbers skipped, numbers stored as numbers. Made-up data only.
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
await page.click('#bulkBox summary');
await page.setInputFiles('#bulkFile', { name: 'staff.xlsx', mimeType: XLSX, buffer: makeXlsx([
  ['क्र.', 'नाम', 'मोबाइल', 'पद', 'गाँव'],
  [1, 'एक्सेल नमूना एक', 9000000011, 'मीटर रीडर', 'नमूना गाँव'],
  [2, 'EXCEL SAMPLE TWO', '9000000012', 'OUTSOURCE HELPER', ''],
]) });
await page.waitForFunction(() => document.getElementById('bulkTxt').value.includes('EXCEL SAMPLE TWO'), null, { timeout: 5000 }).catch(() => {});
const fromXlsx = await page.inputValue('#bulkTxt');
await page.click('#bulkAdd');
const afterXlsx = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).staff);
// Villages from the first column of an .xlsx and a .csv.
await page.setInputFiles('#placeFile', { name: 'gaon.xlsx', mimeType: XLSX, buffer: makeXlsx([['गाँव का नाम'], ['नमूना गाँव क'], ['नमूना गाँव ख'], [''], [123]]) });
await page.waitForFunction(() => JSON.parse(localStorage.getItem('priority-note-v2')).places.includes('नमूना गाँव ख'), null, { timeout: 5000 }).catch(() => {});
await page.setInputFiles('#placeFile', { name: 'gaon.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFFक्र.,गाँव\n1,"नमूना गाँव ग, टोला"\n2,नमूना गाँव क\n') });
await page.waitForFunction(() => JSON.parse(localStorage.getItem('priority-note-v2')).places.includes('नमूना गाँव ग, टोला'), null, { timeout: 5000 }).catch(() => {});
const placesNow = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).places);
const staffTxt = await page.$eval('#staffList', (n) => n.innerText);
// Contact list: grouped by मुख्यालय, call and WhatsApp for each number, WhatsApp carries pending work.
const groups = await page.$$eval('#staffList .hq > summary', (s) => s.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
const links = await page.$$eval('#staffList .pr', (rows) => rows.map((r) => ({
  n: r.querySelector('.who b').textContent, tel: (r.querySelector('a.call') || {}).href || '', wa: (r.querySelector('a.wa') || {}).href || '', edit: !!r.querySelector('.edit'),
})));
// The sample staff member has a pending task and gets a number through the form ("बदलें").
await page.click('#staffEditBtn');
const editShown = await page.$$eval('#staffList .edit', (e) => e.length);
await page.click('#staffList [aria-label="बदलें: नमूना कर्मचारी"]');
await page.fill('#sm', '9000000004');
await page.fill('#sh', 'नमूना गाँव');
await page.click('#sbtn');
await page.click('#staffEditBtn');
const sampleRow = await page.$$eval('#staffList .pr', (rows) => { const r = rows.find((x) => x.querySelector('.who b').textContent === 'नमूना कर्मचारी'); return r ? { wa: r.querySelector('a.wa').href, txt: r.innerText, sticker: !!r.querySelector('button.ic') } : null; });
const listsTxt = await page.$eval('#listsCard', (n) => n.innerText);
const hScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await page.click('#tplList >> [aria-label="हटाएँ: बकाया वसूली"]');
const tplGone = !(await page.$eval('#tplList', (n) => n.innerText)).includes('बकाया वसूली')
  && !(await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).tpl)).includes('बकाया वसूली');

const checks = {
  'कोई JS error नहीं': errors.length === 0,
  'शीर्षक: आज के प्राथमिकता वाले कार्य': note.includes('आज के प्राथमिकता वाले कार्य'),
  'पुराना शीर्षक नहीं': !note.includes('आज का मिशन'),
  '"बनाया गया" लाइन नहीं': !note.includes('बनाया गया'),
  'तारीख नोट पर एक ही बार': note.split(new Date().getDate() + ' ' + MONTHS[new Date().getMonth()]).length === 2,
  'काम नोट पर दिखे': note.includes('नमूना काम एक') && note.includes('नमूना काम दो'),
  'हस्ताक्षर दिखे': note.includes('— JE'),
  'PNG बनी': true,
  'रिकॉर्ड में महीना चुनें (2 महीने)': logMonths === 2,
  'पुराने रिकॉर्ड का कार्ड भी छोटी JPEG (420px, 60 KB से कम), दबाने पर बड़ा': !!oldCard && oldCard.type === 'image/jpeg' && oldCard.w === 420 && oldCard.kb < 60 && oldOpens,
  'रिकॉर्ड में नोट की छोटी फोटो (420px JPEG, 60 KB से कम)': !!logThumb && logThumb.type === 'image/jpeg' && logThumb.w === 420 && logThumb.kb < 60,
  '400px पर horizontal scroll नहीं': !hScroll,
  'index.html और version.json का संस्करण एक': !!appV && appV === fileV,
  'संस्करण नीचे दिखे': verLabel === 'संस्करण ' + appV,
  'अपडेट के बाद नारंगी बैनर दिखे': updTitle.includes('ऐप अपडेट हुआ') && updTitle.includes(appV),
  '"ठीक है" से बैनर बंद हो और याद रहे': updClosed && updSaved === appV,
  'नया संस्करण आने पर बैनर दिखे': newTitle.includes('नया संस्करण 99.0'),
  'सिर्फ़ दो टैब: आज के काम, स्टाफ़': tabs.join('|') === 'आज के काम|स्टाफ़',
  'पुराने काम पर "3 दिन से बाकी"': note.includes('⏳ 3 दिन से बाकी'),
  'रोज़ के काम का बटन लिखे': tplFilled === 'बकाया वसूली',
  'स्थान अगली बार चुनने को मिले': placeOffered.includes('नमूना फीडर'),
  'बोलकर लिखने का बटन ठीक': micOk,
  'याद दिलाने का अलग डिब्बा/switch नहीं (सिर्फ़ 🔔)': remCardGone,
  'ऊपर 🔔 से हर घंटे याद दिलाना चालू हो': bellOn,
  '"✏️ बदलें" से रोज़ का काम बदले': tplNow.includes('मीटर रीडिंग की जाँच') && !tplNow.includes('मीटर रीडिंग') && tplChips.includes('मीटर रीडिंग की जाँच'),
  'वहीं "हटाएँ" से रोज़ का काम हटे': !tplNow.includes('फीडर पेट्रोलिंग'),
  'स्टाफ़ टैब में महीने के सारांश की गिनती': mon.includes('काम जोड़े 1') && !mon.includes('निर्देश'),
  'महीने का सारांश शुरू में बंद': monFolded,
  'स्टाफ़ में बाकी काम दिखें, "कोई काम बाकी नहीं" नहीं': staffTxt.includes('1 काम बाकी') && !staffTxt.includes('कोई काम बाकी नहीं'),
  'स्टाफ़ मुख्यालय-वार समूहों में': groups.some((g) => g.startsWith('📍 नमूना गाँव')) && groups.some((g) => g.startsWith('📍 मुख्यालय नहीं लिखा')),
  'हर नंबर पर 📞 कॉल और 💬 WhatsApp': links.filter((l) => l.tel).every((l) => /^tel:\+919\d{9}$/.test(l.tel) && l.wa.startsWith('https://wa.me/919')) && links.some((l) => l.n === 'नमूना दो' && l.tel === 'tel:+919000000002'),
  'बदलें/हटाएँ सिर्फ़ "✏️ बदलें / हटाएँ" दबाने पर': !links.some((l) => l.edit) && editShown > 0,
  'बाकी काम वाले के WhatsApp में काम लिखा, 🖼️ स्टीकर बटन': !!sampleRow && sampleRow.wa.startsWith('https://wa.me/919000000004?text=') && decodeURIComponent(sampleRow.wa).includes('नमूना काम दो') && sampleRow.sticker,
  'कई स्टाफ़ एक साथ जुड़ें (नाम, नंबर, पद)': bulk.some((x) => x.n === 'नमूना एक' && x.m === '919000000001' && x.r === 'मीटर रीडर' && x.h === 'नमूना गाँव') && bulk.some((x) => x.n === 'नमूना दो' && x.m === '919000000002' && x.r === 'आउटसोर्स हेल्पर' && !x.h),
  'बिना नंबर वाली लाइन छोड़ी': !bulk.some((x) => x.n.includes('बिना नंबर')),
  'Excel फ़ाइल से स्टाफ़ (शीर्षक/क्र. छोड़े)': fromXlsx.includes('एक्सेल नमूना एक — 9000000011 — मीटर रीडर — नमूना गाँव') && !fromXlsx.includes('मोबाइल')
    && afterXlsx.some((x) => x.n === 'EXCEL SAMPLE TWO' && x.m === '919000000012' && x.r === 'OUTSOURCE HELPER'),
  'Excel और CSV से गाँव (शीर्षक/अंक/दोहराव छोड़े)': ['नमूना गाँव क', 'नमूना गाँव ख', 'नमूना गाँव ग, टोला'].every((v) => placesNow.includes(v))
    && placesNow.filter((v) => v === 'नमूना गाँव क').length === 1 && !placesNow.some((v) => /गाँव का नाम|^123$|^गाँव$/.test(v)),
  'वही नंबर दोबारा: नाम बदला, दोहराया नहीं (पद बना रहा)': bulk2.length === bulk.length && bulk2.some((x) => x.n === 'नमूना एक बदला नाम' && x.r === 'मीटर रीडर' && x.h === 'नमूना गाँव'),
  'स्टाफ़ टैब में सूचियाँ दिखें': listsTxt.includes('बकाया वसूली') && listsTxt.includes('नमूना फीडर'),
  'स्टाफ़/रिपोर्ट टैब पर horizontal scroll नहीं': !hScroll2,
  '"हटाएँ" से रोज़ का काम सूची से हटे': tplGone,
};

await browser.close();
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  if (!pass) ok = false;
}
if (errors.length) console.log(errors.join('\n'));
process.exit(ok ? 0 : 1);
