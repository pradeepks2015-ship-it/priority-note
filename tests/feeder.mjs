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
page.on('dialog', (d) => d.accept());
await page.goto(url);

await page.click('#tab-feeder');
const noteHidden = await page.$eval('#noteCol', (n) => n.hidden);
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
const lineDrawn = await page.$$eval('#fdMap path.leaflet-interactive', (p) => p.length);

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
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

// Saved: after reopening, the feeder is in the list with its length and transformer.
await page.reload();
await page.click('#tab-feeder');
const listTxt = await page.$eval('#fdItems', (n) => n.innerText);
await page.click('#fdItems [aria-label="खोलें: नमूना फीडर"]');
await page.waitForSelector('#fdMap .dtico', { timeout: 8000 }).catch(() => {});
const reopened = await page.$$eval('#fdMap .dtico', (m) => m.length);
await page.click('text=और विकल्प');
await page.click('#fdDelete');
const gone = await page.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).feeders.length === 0);

await browser.close();
const checks = {
  'फीडर टैब में नोट वाला हिस्सा छिपा': noteHidden,
  'नक्शा खुला': mapReady,
  'चलते समय "नाप रहे हैं"': recStat.includes('नाप रहे हैं'),
  'लंबाई ~150 मी. (कमज़ोर GPS और 1 km की छलाँग छोड़ी)': len.m > 140 && len.m < 160 && len.pts === 6,
  'नक्शे पर रास्ता बना': lineDrawn >= 1,
  'ट्रांसफार्मर का नाम अपने-आप DT-1': dtName === 'DT-1',
  'ट्रांसफार्मर सूची में kVA, उपभोक्ता, LT': dtList.includes('DT-1') && dtList.includes('63 kVA') && dtList.includes('45 उपभोक्ता') && dtList.includes('LT 820 मी.'),
  'ट्रांसफार्मर की फोटो': dtThumb === 1,
  'नक्शे पर ट्रांसफार्मर का निशान': dtMarker.length === 1 && dtMarker[0].includes('DT-1'),
  'खंभों का अनुमान (150 मी. → लगभग 3)': poleHint === 'लगभग 3',
  'सारांश में लिखे खंभे और कुल': sum.includes('खंभे 7') && sum.includes('उपभोक्ता 45') && sum.includes('63 kVA'),
  'WhatsApp सारांश में लंबाई और नक्शे का लिंक': wa.includes('फीडर: नमूना फीडर') && /लंबाई \(GPS से\): 1[45]\d मी\./.test(wa) && wa.includes('https://maps.google.com/?q=22.50') && wa.includes('खंभे: 7'),
  'KML फ़ाइल में रास्ता और DT': kml.includes('<LineString>') && kml.includes('<name>DT-1</name>') && kml.includes('79.2,22.5'),
  'आड़ा स्क्रॉल नहीं': !hScroll,
  'दोबारा खोलने पर फीडर सूची में': listTxt.includes('नमूना फीडर') && listTxt.includes('1 ट्रांसफार्मर') && reopened === 1,
  'फीडर हटाना (पूछकर)': gone,
  'कोई JS error नहीं': errors.length === 0,
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) { console.log((pass ? 'PASS ' : 'FAIL ') + name); if (!pass) ok = false; }
if (!ok) console.log(JSON.stringify({ len, recStat, dtList, dtMarker, poleHint, sum, wa, listTxt, errors }, null, 1));
process.exit(ok ? 0 : 1);
