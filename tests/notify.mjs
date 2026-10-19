// Checks the hourly reminder text and the 9–6 window (no Firebase needed).
import { buildReminder, inWorkHours } from '../notify/build.mjs';

const T = (t, p, more) => ({ t, p, st: '', ...more });
const r = buildReminder({
  tasks: [T('मीटर रीडिंग', 3), T('पूरा हुआ काम', 1, { st: 'done' }), T('DT फ्यूज़ बदलना', 1, { w: 'रामू', due: '12:00' }),
    T('बकाये की सूची', 2), T('शिकायत निराकरण', 3)],
  orders: [T('पुराना निर्देश (अब ऐप में नहीं दिखता)', 1, { no: 15 })],
});
const checks = {
  'कुछ बाकी न हो तो सूचना नहीं': buildReminder({ tasks: [T('x', 1, { st: 'done' })], orders: [] }) === null,
  'शीर्षक में बाकी की गिनती': r.title === '🔔 अभी की प्राथमिकता · 4 बाकी',
  'सबसे ज़रूरी पहले, कर्मचारी और समय के साथ': r.body.split('\n')[0] === '🔴 DT फ्यूज़ बदलना → रामू ⏰ 12:00',
  'दूसरी प्राथमिकता का काम': r.body.includes('🟡 बकाये की सूची'),
  'पुराने निर्देश सूचना में नहीं': !r.body.includes('पुराना निर्देश'),
  'तीन से ज़्यादा हों तो "… और"': r.body.endsWith('… और 1'),
  'पूरा हुआ काम नहीं': !r.body.includes('पूरा हुआ काम'),
  'सुबह 9:03 (IST) काम के घंटे में': inWorkHours(new Date('2026-10-19T03:33:00Z')),
  'शाम 6:40 (IST) भी (देर से चली सूचना)': inWorkHours(new Date('2026-10-19T13:10:00Z')),
  'रात 8 बजे (IST) नहीं': !inWorkHours(new Date('2026-10-19T14:30:00Z')),
  'सुबह 8 बजे (IST) नहीं': !inWorkHours(new Date('2026-10-19T02:30:00Z')),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) { console.log((pass ? 'PASS ' : 'FAIL ') + name); if (!pass) ok = false; }
process.exit(ok ? 0 : 1);
