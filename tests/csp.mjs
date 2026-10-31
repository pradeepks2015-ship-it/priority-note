// Content-Security-Policy (ADEGAON वाली प्रक्रिया): ऐप सिर्फ़ इन्हीं पतों से script/डेटा/चित्र ले और भेज सके।
// index.html के अंदर लिखी script को उसके sha256 hash से अनुमति है ('unsafe-inline' नहीं) — script बदली तो hash बदलेगा:
//   node tests/csp.mjs          → जाँच (CI में): meta का hash ही असली script का hash हो, और नीति की ज़रूरी बातें मौजूद हों
//   node tests/csp.mjs --fix    → hash अपने-आप नया लिख दे (हर index.html बदलाव के बाद चलाएँ)
// कोई नया बाहरी पता (script/fetch/चित्र/iframe) जोड़ें तो उसे नीचे POLICY में भी जोड़ें, वरना ब्राउज़र चुपचाप रोकेगा।
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = new URL('../index.html', import.meta.url);
const POLICY = [
  "default-src 'self'",
  "script-src 'self' HASHES https://www.gstatic.com https://apis.google.com https://www.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com https://*.googleusercontent.com https://www.gstatic.com",
  "connect-src 'self' blob: https://*.googleapis.com https://www.gstatic.com https://apis.google.com https://www.google.com",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://www.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

let html = readFileSync(file, 'utf8');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
const want = `<meta http-equiv="Content-Security-Policy" content="${POLICY.replace('HASHES', hashes.join(' '))}">`;
const re = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const have = (re.exec(html) || [])[0];

if (process.argv.includes('--fix')) {
  html = have ? html.replace(re, want) : html.replace('<meta charset="utf-8">\n', `<meta charset="utf-8">\n${want}\n`);
  writeFileSync(file, html);
  console.log(`✅ CSP लिखी — ${hashes.length} inline script के hash`);
} else if (have !== want) {
  console.error(have ? '❌ CSP पुरानी है (script बदली या नीति बदली) — चलाएँ: node tests/csp.mjs --fix' : '❌ index.html में CSP नहीं — चलाएँ: node tests/csp.mjs --fix');
  process.exit(1);
} else console.log(`✅ CSP ठीक — ${hashes.length} inline script का hash मेल खाता है, 'unsafe-inline' script नहीं`);
