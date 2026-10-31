// CSS के इस ऐप के अपने नियम (CLAUDE.md): रंग सिर्फ़ :root के tokens से आएँ (ताकि dark mode में भी ठीक रहें),
// और हर var(--नाम) सचमुच कहीं परिभाषित हो (नाम की टाइपो = रंग चुपचाप गायब)। परछाई (box-shadow/text-shadow)
// का काला-पारदर्शी रंग हर थीम में एक जैसा है, इसलिए वह छूट में है। चलाएँ: node tests/check-css.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(process.argv[2] || new URL('../index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const problems = [];
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
// tokens the JS sets on elements (style.setProperty) count as defined too
for (const m of html.matchAll(/setProperty\('(--[\w-]+)'/g)) defined.add(m[1]);

css.split('\n').forEach((line, i) => {
  for (const d of line.matchAll(/(?<![\w-])(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = d;
    if (prop.startsWith('--') || /^(box|text)-shadow$/.test(prop)) continue;
    if (COLOUR.test(value)) problems.push(`index.html <style> पंक्ति ${i + 1}: "${prop}: ${value.trim()}" — रंग सीधे लिखा है, :root में token बनाकर var(--…) लें`);
  }
  for (const v of line.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(v[1])) problems.push(`index.html <style> पंक्ति ${i + 1}: ${v[1]} कहीं परिभाषित नहीं`);
});
// JS में बने रंग भी tokens से: tok('--x') वाले नाम परिभाषित हों
for (const m of html.matchAll(/tok\('(--[\w-]+)'\)/g)) if (!defined.has(m[1])) problems.push(`index.html JS: tok('${m[1]}') — यह token परिभाषित नहीं`);

if (problems.length) {
  console.error('❌ CSS जाँच नाकाम:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`✅ CSS जाँच पास — रंग tokens से, ${defined.size} tokens परिभाषित, कोई अनजाना var() नहीं`);
