// सुरक्षा (ADEGAON वाली प्रक्रिया): GitHub Actions के बाहरी actions पक्के commit SHA से जुड़ें।
// "actions/checkout@v7" जैसा tag बाद में किसी और commit पर खिसकाया जा सकता है — उस action में सेंध लगे तो
// हमारे workflow में चलकर FIREBASE_SA जैसा secret चुरा सकता है। 40 अक्षर का SHA बदला नहीं जा सकता।
// नया action: git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> से SHA लें, "uses: owner/repo@<sha> # <tag>" लिखें।
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const bad = [];
let n = 0;
for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
  readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
    const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
    if (!m) return;
    n++;
    if (m[1].startsWith('./')) return;
    if (!/@[0-9a-f]{40}$/.test(m[1])) bad.push(`${f}:${i + 1}  ${m[1]}`);
  });
}
if (bad.length) {
  console.error('❌ ये actions पक्के commit SHA से नहीं जुड़े (tag खिसक सकता है):\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`✅ सभी ${n} actions commit SHA से जुड़े हैं`);
