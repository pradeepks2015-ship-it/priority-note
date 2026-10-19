// Builds a minimal .xlsx (a zip of XML files) for tests: text cells go to sharedStrings, numbers stay numbers.
// The sheet is deflate-compressed like Excel's own files; the other parts are stored.
import { deflateRawSync } from 'node:zlib';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const col = (i) => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); } return s; };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const { name, data, deflate } of entries) {
    const raw = Buffer.from(data), body = deflate ? deflateRawSync(raw) : raw, nm = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, nm, body); centrals.push(c, nm); off += 30 + nm.length + body.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function makeXlsx(rows) {
  const ss = [];
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
    if (v === '' || v == null) return '';
    const ref = col(ci) + (ri + 1);
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    ss.push(v); return `<c r="${ref}" t="s"><v>${ss.length - 1}</v></c>`;
  }).join('') + '</row>').join('');
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${NS}">${ss.map((t) => `<si><t>${esc(t)}</t></si>`).join('')}</sst>` },
    { name: 'xl/worksheets/sheet1.xml', deflate: true, data: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetData>${sheetRows}</sheetData></worksheet>` },
  ]);
}
