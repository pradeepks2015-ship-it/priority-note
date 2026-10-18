// Smoke test: opens the app at phone width and checks the note and the PNG.
// Run: serve the repo root (python3 -m http.server 8080), then
//   APP_URL=http://127.0.0.1:8080/ node tests/smoke.mjs
// Uses made-up sample tasks only — never real staff data.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.env.APP_URL || 'http://127.0.0.1:8080/';
const fileV = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8')).v;
const appV = (readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/APP_V='([^']+)'/) || [])[1];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.addInitScript(() => {
  const T = (id, t) => ({ id, t, p: 1, w: '', st: '', r: '', loc: '', due: '', ref: '', q: '', img: '', carry: false });
  localStorage.setItem('priority-note-v2', JSON.stringify({
    tasks: [T('a', 'नमूना काम एक'), T('b', 'नमूना काम दो')],
    orders: [], staff: [], log: [], color: 'yellow', sign: 'JE', remind: false,
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
await page.route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: '{"v":"99.0"}' }));
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForFunction(() => !document.getElementById('upd').hidden, null, { timeout: 5000 }).catch(() => {});
const newTitle = await page.$eval('#upd', (n) => (n.hidden ? '' : n.innerText));
await page.unroute('**/version.json*');

await page.click('#img');
await page.waitForFunction(() => window.__pngSize > 0, null, { timeout: 15000 });

const checks = {
  'कोई JS error नहीं': errors.length === 0,
  'शीर्षक: आज के प्राथमिकता वाले कार्य': note.includes('आज के प्राथमिकता वाले कार्य'),
  'पुराना शीर्षक नहीं': !note.includes('आज का मिशन'),
  '"बनाया गया" लाइन नहीं': !note.includes('बनाया गया'),
  'काम नोट पर दिखे': note.includes('नमूना काम एक') && note.includes('नमूना काम दो'),
  'हस्ताक्षर दिखे': note.includes('— JE'),
  'PNG बनी': true,
  '400px पर horizontal scroll नहीं': !hScroll,
  'index.html और version.json का संस्करण एक': !!appV && appV === fileV,
  'संस्करण नीचे दिखे': verLabel === 'संस्करण ' + appV,
  'अपडेट के बाद नारंगी बैनर दिखे': updTitle.includes('ऐप अपडेट हुआ') && updTitle.includes(appV),
  '"ठीक है" से बैनर बंद हो और याद रहे': updClosed && updSaved === appV,
  'नया संस्करण आने पर बैनर दिखे': newTitle.includes('नया संस्करण 99.0'),
};

await browser.close();
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  if (!pass) ok = false;
}
if (errors.length) console.log(errors.join('\n'));
process.exit(ok ? 0 : 1);
