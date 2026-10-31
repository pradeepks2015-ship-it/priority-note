// XSS का असली हमला (ADEGAON वाली प्रक्रिया): हर जगह जहाँ बाहर से डेटा आता है — काम, स्टाफ़ का नाम/पद/मुख्यालय,
// रोज़ के काम, स्थान, तालिका, गाँव/फीडर, सर्वे करने वाला, DT, खंभा नंबर/टिप्पणी, भेजा गया रिकॉर्ड, सर्वे फ़ाइल —
// वहाँ HTML/JS डालकर पूरा ऐप घुमाया जाता है। कहीं भी वह चल जाए (window.__xss) या असली <img> बन जाए तो टेस्ट फेल।
// चलाएँ: python3 -m http.server 8080 के बाद APP_URL=http://127.0.0.1:8080/ node tests/xss.mjs
import { chromium } from 'playwright';

const url = process.env.APP_URL || 'http://127.0.0.1:8080/';
const X = (tag) => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${tag}')"><svg onload="window.__xss=(window.__xss||[]).concat('${tag}-svg')"></svg>`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, acceptDownloads: true });
await ctx.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (r) => r.abort());
const seed = {
  tasks: [
    { id: 't1', t: X('task'), p: 1, w: X('who'), loc: X('loc'), ref: X('ref'), q: X('q'), tb: 'मुख्यालय | ' + X('th') + '\n' + X('td') + ' | 5', at: Date.now() - 3 * 864e5 },
    { id: 't2', t: 'सामान्य काम', p: 1, w: '', at: Date.now() },
  ],
  orders: [],
  staff: [{ id: 's1', n: X('who'), m: '919000000001', r: X('role'), h: X('hq') }],
  tpl: [X('tpl')], places: [X('place')],
  log: [{ id: 'l1', ts: Date.now(), lbl: X('loglbl'), tot: 1, done: 0, txt: X('logtxt') }],
  sign: X('sign'),
  feeders: [{ id: 'f1', n: X('feeder'), by: X('by'), segs: [], dts: [{ id: 'd1', n: X('dt'), note: X('dtnote'), lat: 22.5, lng: 79.2 }],
    pl: [{ id: 'p1', no: X('pole'), k: 'l', c: 3, to: 'd1', note: X('polenote'), lat: 22.5002, lng: 79.2 }, { id: 'p2', no: '7', k: 'l', c: 1, to: 'p1', lat: 22.5004, lng: 79.2 }] }],
};
await ctx.addInitScript((d) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('priority-note-ver', '99'); localStorage.setItem('priority-note-v2', JSON.stringify(d)); }, seed);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// anything the app's Content-Security-Policy blocks counts as an error
page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) errors.push('CSP: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(url);
const visit = [];
const step = async (name, fn) => { await fn(); await page.waitForTimeout(150); visit.push(name); };

await step('आज के काम', async () => { await page.click('#addCard details.more summary'); await page.fill('#tb', X('typed-table')); });
await step('रिकॉर्ड', async () => { await page.click('#logSum'); });
await step('स्टाफ़', async () => { await page.click('#tab-staff'); await page.click('#staffEditBtn'); });
await step('फीडर सूची', async () => { await page.click('#tab-feeder'); await page.click('#placesSum'); });
await step('फीडर नक्शा', async () => {
  await page.click('#fdItems button');
  await page.waitForSelector('#fdMap .leaflet-overlay-pane canvas', { state: 'attached', timeout: 8000 }).catch(() => {});
  await page.evaluate(() => window.__fdMap && window.__fdMap.setView([22.5002, 79.2], 18));
  await page.waitForTimeout(300);
});
await step('खंभा खोज', async () => { await page.fill('#plQ', '7'); await page.click('#plFind button[type=submit]'); });
await step('खंभा फ़ॉर्म', async () => { await page.click('#plInfo button'); await page.waitForTimeout(100); await page.click('#plCancel'); });
await step('DT फ़ॉर्म', async () => { await page.click('#dtList button:has-text("बदलें")'); await page.click('#dtCancel'); });
await step('सर्वे फ़ाइल जोड़ें', async () => {
  await page.click('#fdBack');
  const f = { app: 'priority-note', type: 'survey', v: 1, f: { ...seed.feeders[0], id: 'f2', n: X('imported') } };
  await page.setInputFiles('#fdImp', { name: 's.txt', mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify(f)) });
});
await step('नोट फोटो', async () => {
  await page.click('#tab-tasks');
  await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#img')]);
});

const result = await page.evaluate(() => ({ xss: window.__xss || [], imgs: document.querySelectorAll('img[src="x"], svg[onload]').length }));
await browser.close();

const checks = {
  ['डाला गया HTML/JS कहीं नहीं चला (' + visit.join(', ') + ')']: result.xss.length === 0,
  'कोई असली <img>/<svg> नहीं बना': result.imgs === 0,
  'ऐप बिना error चला': errors.length === 0,
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) { console.log((pass ? 'PASS ' : 'FAIL ') + name); if (!pass) ok = false; }
if (!ok) console.log(JSON.stringify({ result, errors }, null, 1));
process.exit(ok ? 0 : 1);
