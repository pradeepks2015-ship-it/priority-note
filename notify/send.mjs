// Hourly reminder: for every account that switched on "हर घंटे याद दिलाएँ", read its saved state from
// Firestore users/{uid} and send the top pending work to each of its phones (field `fcm`).
// Runs from .github/workflows/remind.yml with the Firebase service-account key in the FIREBASE_SA secret.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { buildReminder, inWorkHours } from './build.mjs';

if (!process.env.FIREBASE_SA) { console.log('FIREBASE_SA secret नहीं है, सूचना नहीं भेजी'); process.exit(0); }
if (!inWorkHours() && process.env.FORCE !== '1') { console.log('काम के घंटे नहीं (9–6), सूचना नहीं भेजी'); process.exit(0); }

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = getFirestore();
const snap = await db.collection('users').where('rem', '==', true).get();
let sent = 0, failed = 0, noPhone = 0, nothingPending = 0;
for (const d of snap.docs) {
  const { s, fcm = [] } = d.data();
  let state; try { state = JSON.parse(s); } catch { continue; }
  const msg = buildReminder(state);
  if (!fcm.length) { noPhone++; continue; }
  if (!msg) { nothingPending++; continue; }
  for (const token of fcm) {
    try {
      // Data-only message: sw.js shows it, so it looks the same on every phone.
      await getMessaging().send({ token, data: msg, webpush: { headers: { Urgency: 'high', TTL: '3000' } } });
      sent++;
    } catch (e) {
      failed++;
      if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-argument') {
        await d.ref.update({ fcm: FieldValue.arrayRemove(token) });
      }
      console.log('भेजने में दिक्कत:', e.code || e.message);
    }
  }
}
// Counts only, no names or task text in the public log.
console.log(`'हर घंटे याद दिलाएँ' चालू खाते: ${snap.size} · जिनमें किसी फ़ोन की सूचना-key नहीं: ${noPhone} · जिनमें कोई काम बाकी नहीं: ${nothingPending}`);
console.log(`सूचनाएँ भेजीं: ${sent}, नहीं गईं: ${failed}`);
