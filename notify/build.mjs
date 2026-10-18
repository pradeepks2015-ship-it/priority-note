// Builds the hourly reminder from the saved app state (the same `S` the app keeps).
// Returns null when nothing is pending. Used by notify/send.mjs and tests/notify.mjs.
const PRI = { 1: '🔴', 2: '🟡', 3: '🟢' };

export function buildReminder(s) {
  const open = [...(s.tasks || []), ...(s.orders || [])].filter((x) => x && x.st !== 'done');
  if (!open.length) return null;
  open.sort((a, b) => (a.p || 2) - (b.p || 2) || (a.due || '99').localeCompare(b.due || '99'));
  const line = (x) => (PRI[x.p] || '🟡') + ' ' + (x.no ? 'No. ' + x.no + ' · ' : '') + x.t
    + (x.w ? ' → ' + x.w : '') + (x.due ? ' ⏰ ' + x.due : '');
  const top = open.slice(0, 3).map(line);
  if (open.length > 3) top.push('… और ' + (open.length - 3));
  return { title: '🔔 अभी की प्राथमिकता · ' + open.length + ' बाकी', body: top.join('\n') };
}

// 9 AM to 6 PM India time (GitHub's schedule can run a little late, so the hour is checked here).
export function inWorkHours(now = new Date()) {
  const h = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) / 60 % 24;
  return h >= 9 && h < 19;
}
