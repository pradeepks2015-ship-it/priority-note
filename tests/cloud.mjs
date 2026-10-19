// Online-backup test with a stand-in Firebase: the three SDK files are replaced by small fakes,
// and the "online" document lives in this script. Each browser context is a separate phone.
// Run like smoke.mjs: serve the repo root, then APP_URL=http://127.0.0.1:8080/ node tests/cloud.mjs
import { chromium } from 'playwright';

const url = process.env.APP_URL || 'http://127.0.0.1:8080/';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
const DOC = 'https://fake-firestore.test/__doc';
let doc = null; // users/{uid} as the app wrote it: { s, t, v, rem, fcm }

const FAKE = {
  'firebase-app.js': `export function initializeApp(c){return {c}}`,
  'firebase-auth.js': `
    let cb=null,user=JSON.parse(localStorage.getItem('fake-user')||'null');
    export function getAuth(){return {}}
    export class GoogleAuthProvider{}
    export function getRedirectResult(){return Promise.resolve(null)}
    export function onAuthStateChanged(a,f){cb=f;setTimeout(()=>f(user),0)}
    export function signInWithPopup(){user={uid:'u1',email:'jeadegaon@example.com',displayName:'जेई आदेगाँव'};localStorage.setItem('fake-user',JSON.stringify(user));setTimeout(()=>cb&&cb(user),0);return Promise.resolve({user})}
    export function signInWithRedirect(){return signInWithPopup()}
    export function signOut(){user=null;localStorage.removeItem('fake-user');cb&&cb(null);return Promise.resolve()}`,
  'firebase-firestore.js': `
    export function getFirestore(){return {}}
    export function doc(db,c,id){return {path:c+'/'+id}}
    export const arrayUnion=(...a)=>({__au:a}), arrayRemove=(...a)=>({__ar:a});
    export async function setDoc(d,v,o){await fetch('${DOC}',{method:'POST',body:JSON.stringify({v,merge:!!(o&&o.merge)})})}
    export function onSnapshot(d,next){
      let last=null;
      const tick=async()=>{const t=await (await fetch('${DOC}')).text();if(t!==last){last=t;const v=t?JSON.parse(t):null;next({exists:()=>!!v,data:()=>v,metadata:{hasPendingWrites:false}})}};
      tick();const h=setInterval(tick,250);return ()=>clearInterval(h);
    }`,
  'firebase-messaging.js': `
    export function getMessaging(){return {}}
    export function getToken(m,o){return Promise.resolve(o&&o.vapidKey&&o.serviceWorkerRegistration?'tok-'+(localStorage.getItem('fake-dev')||'x'):'')}`,
};
// Firestore setDoc with {merge:true}: arrayUnion/arrayRemove change lists, other fields replace.
function write({ v, merge }) {
  const cur = merge && doc ? JSON.parse(doc) : {};
  for (const [k, val] of Object.entries(v)) {
    if (val && val.__au) cur[k] = [...new Set([...(cur[k] || []), ...val.__au])];
    else if (val && val.__ar) cur[k] = (cur[k] || []).filter((x) => !val.__ar.includes(x));
    else cur[k] = val;
  }
  doc = JSON.stringify(cur);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function phone(seed) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.grantPermissions(['notifications']);
  await ctx.route(SDK + '*', (r) => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE[r.request().url().slice(SDK.length)] }));
  await ctx.route(DOC, async (r) => {
    const cors = { 'access-control-allow-origin': '*' };
    if (r.request().method() === 'POST') { write(JSON.parse(r.request().postData())); return r.fulfill({ headers: cors, body: '' }); }
    return r.fulfill({ headers: cors, body: doc || '' });
  });
  await ctx.addInitScript((d) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('priority-note-ver', '99');
    if (d) localStorage.setItem('priority-note-v2', JSON.stringify(d.state));
    localStorage.setItem('fake-dev', d ? d.dev : 'B');
  }, seed ? { state: seed.state, dev: seed.dev } : null);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.errors = errors;
  await p.goto(url);
  await p.click('#me');
  return p;
}
const T = (id, t) => ({ id, t, p: 1, w: '', st: '', r: '', loc: '', due: '', ref: '', q: '', img: '', carry: false, at: Date.now() });
const cloudText = (p) => p.$eval('#cloudBox', (n) => n.innerText);
const tasksOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).tasks.map((x) => x.t));
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);

// Phone A has data and logs in: its data goes online.
const A = await phone({ dev: 'A', state: { tasks: [T('a', 'फ़ोन A का काम')], orders: [{ ...T('o', 'नमूना निर्देश'), no: 7 }], ordNo: 7, staff: [], log: [] } });
const offBtn = await cloudText(A);
await A.click('#cloudIn');
const aOn = await until(A, () => document.getElementById('cloudBox').innerText.includes('ऑनलाइन सेव चालू'));
await A.waitForTimeout(500);
const uploaded = !!doc && JSON.parse(JSON.parse(doc).s).tasks.some((x) => x.t === 'फ़ोन A का काम');
const footer = await A.$eval('#ver', (n) => n.innerText);
const meBtn = await A.$eval('#me', (b) => b.textContent + '|' + b.className);

// Phone B is empty and logs in: it gets A's data, and the No. counter.
const B = await phone(null);
await B.click('#cloudIn');
const bGot = await until(B, () => (JSON.parse(localStorage.getItem('priority-note-v2') || '{}').tasks || []).some((x) => x.t === 'फ़ोन A का काम'));
const bOrdNo = await B.evaluate(() => JSON.parse(localStorage.getItem('priority-note-v2')).ordNo);

// A change on B shows up on A by itself.
await B.click('#tab-tasks');
await B.fill('#txt', 'फ़ोन B का काम');
await B.press('#txt', 'Enter');
const aGot = await until(A, () => JSON.parse(localStorage.getItem('priority-note-v2')).tasks.some((x) => x.t === 'फ़ोन B का काम'));

// Hourly reminder on: each phone's token is saved, the rest of the document stays.
await A.click('#tab-tasks');
await A.click('#bell');
const aPush = await until(A, () => document.getElementById('pushBox').innerText.includes('ऐप बंद होने पर भी इस फ़ोन पर सूचना आएगी'));
const afterA = JSON.parse(doc);
await B.click('#bell');
await until(B, () => document.getElementById('pushBox').innerText.includes('ऐप बंद होने पर भी'));
await B.waitForTimeout(400);
const afterB = JSON.parse(doc);

// Phone C has its own data: it asks; "OK" keeps the online data.
const C = await phone({ dev: 'C', state: { tasks: [T('c', 'फ़ोन C का पुराना काम')], orders: [], staff: [], log: [] } });
let asked = '';
C.on('dialog', (d) => { asked = d.message(); d.accept(); });
await C.click('#cloudIn');
const cKept = await until(C, () => JSON.parse(localStorage.getItem('priority-note-v2')).tasks.some((x) => x.t === 'फ़ोन B का काम'));
const cTasks = await tasksOf(C);

// Reopening A keeps it logged in and in sync.
await A.reload();
await A.click('#me');
const aBack = await until(A, () => document.getElementById('cloudBox').innerText.includes('ऑनलाइन सेव चालू'));

// Logging out keeps the data on the phone and stops reminders to it.
if (await A.$eval('#mePanel', (n) => n.hidden)) await A.click('#me');
await A.click('#cloudBox >> text=लॉग आउट');
const aOff = await until(A, () => !!document.getElementById('cloudIn'));
const aStill = (await tasksOf(A)).includes('फ़ोन B का काम');
const meOff = await A.$eval('#me', (b) => b.textContent);
await A.waitForTimeout(400);
const afterLogout = JSON.parse(doc);

await browser.close();
const checks = {
  'लॉगिन से पहले "Google से लॉगिन करें" दिखे': offBtn.includes('Google खाते से लॉगिन करें'),
  'लॉगिन के बाद "ऑनलाइन सेव चालू"': aOn,
  'फ़ोन A का डेटा ऑनलाइन गया': uploaded,
  'नीचे "☁️ ऑनलाइन सेव चालू"': footer.includes('☁️ ऑनलाइन सेव चालू'),
  'ऊपर प्रोफ़ाइल बटन पर नाम का पहला अक्षर': meBtn.startsWith('ज|') && meBtn.includes('on'),
  'खाली फ़ोन B में A का डेटा आया': bGot,
  'फ़ोन B में No. काउंटर आया': bOrdNo === 7,
  'B का नया काम A में अपने-आप आया': aGot,
  'फ़ोन C पर पूछा गया': asked.includes('ऑनलाइन बैकअप में पहले से डेटा है'),
  '"OK" से ऑनलाइन वाला डेटा रहा': cKept && !cTasks.includes('फ़ोन C का पुराना काम'),
  'दोबारा खोलने पर लॉगिन बना रहे': aBack,
  'लॉग आउट के बाद भी डेटा फ़ोन में रहे': aOff && aStill,
  'लॉग आउट पर प्रोफ़ाइल बटन 👤': meOff === '👤',
  'सूचना चालू: फ़ोन A का token सेव, rem चालू': aPush && (afterA.fcm || []).includes('tok-A') && afterA.rem === true,
  'token सेव करते समय बाकी डेटा बना रहे': !!afterA.s && JSON.parse(afterA.s).tasks.length > 0,
  'दोनों फ़ोन के token सेव': ['tok-A', 'tok-B'].every((t) => (afterB.fcm || []).includes(t)),
  'लॉग आउट पर उस फ़ोन का token हटे': !(afterLogout.fcm || []).includes('tok-A') && (afterLogout.fcm || []).includes('tok-B'),
  'कोई JS error नहीं': [A, B, C].every((p) => p.errors.length === 0),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  if (!pass) ok = false;
}
for (const p of [A, B, C]) if (p.errors.length) console.log(p.errors.join('\n'));
process.exit(ok ? 0 : 1);
