// XSS की कोड-जाँच (ADEGAON वाली प्रक्रिया): ऐप में बाहर से आया डेटा (काम, नाम, खंभा नंबर, सर्वे फ़ाइल…) कभी HTML बनकर न चले।
// 1. HTML markup में onclick= जैसे inline handler नहीं — बटन JS से जुड़ते हैं (आगे CSP में inline कोड बंद करना आसान रहे)।
// 2. Leaflet के HTML लेने वाले रास्ते (divIcon html, tooltip/popup content) में डेटा सिर्फ़ xmlEsc() से गुज़रकर।
// 3. javascript: वाले link नहीं।
// innerHTML / insertAdjacentHTML की जाँच ESLint (no-unsanitized) करता है। चलाएँ: node tests/check-xss.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(process.argv[2] || new URL('../index.html', import.meta.url), 'utf8');
const lines = html.split('\n');
const problems = [];
const scriptStart = lines.findIndex((l) => /<script>/.test(l));

lines.forEach((l, i) => {
  const n = i + 1;
  // markup part only (before the first <script>): inline event handler attributes
  if (i < scriptStart && /<[a-z][^>]*\son[a-z]+\s*=/i.test(l)) problems.push(`पंक्ति ${n}: HTML में inline handler (on…=) — JS में addEventListener/onclick से जोड़ें`);
  if (/javascript:/i.test(l) && !/^\s*\/\//.test(l)) problems.push(`पंक्ति ${n}: javascript: वाला पता`);
  // Leaflet calls that take HTML: every dynamic part must go through xmlEsc()
  for (const m of l.matchAll(/(?:\.setContent|\.bindTooltip|\.bindPopup)\(([^)]*\)?)/g)) {
    const arg = m[1];
    if (!/^\s*xmlEsc\(/.test(arg) && !/^\s*'[^']*'\s*\)?$/.test(arg)) problems.push(`पंक्ति ${n}: Leaflet ${m[0].split('(')[0]}() में xmlEsc() नहीं: ${arg.slice(0, 60)}`);
  }
  for (const m of l.matchAll(/html:([^,}]+)/g)) {
    const parts = m[1].split('+').map((x) => x.trim()).filter(Boolean);
    const bad = parts.filter((p) => !/^'[^']*'$/.test(p) && !/^xmlEsc\(/.test(p) && !/^dtSym\(\)$/.test(p) && !/^(pdSym|poleSym)\(/.test(p));
    if (bad.length) problems.push(`पंक्ति ${n}: divIcon html में बिना xmlEsc() का हिस्सा: ${bad.join(' + ').slice(0, 80)}`);
  }
});

if (problems.length) {
  console.error('❌ XSS जाँच नाकाम:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('✅ XSS जाँच पास — कोई inline handler नहीं, नक्शे के HTML में डेटा xmlEsc() से');
