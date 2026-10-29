// POST /api/verify-code  { code: "123456" }   (Authorization: Bearer <Firebase ID token>)
// Checks the code and marks the account's email as verified.
const { admin, db, hash, cors, authUser, crypto } = require("./_shared");

const MAX_ATTEMPTS = 5;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const { uid } = await authUser(req);
    const code = String((req.body && req.body.code) || "").replace(/\D/g, "");
    if (code.length !== 6) return res.status(400).json({ error: "Enter the 6-digit code." });

    const ref = db.collection("emailCodes").doc(uid), snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: "No code found. Tap “Resend code”." });
    const d = snap.data();
    if (Date.now() > d.expiresAt) { await ref.delete(); return res.status(400).json({ error: "That code expired. Tap “Resend code”." }); }
    if ((d.attempts || 0) >= MAX_ATTEMPTS) return res.status(429).json({ error: "Too many wrong tries. Tap “Resend code” for a new one." });

    const a = Buffer.from(hash(uid, code)), b = Buffer.from(d.hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      const left = Math.max(0, MAX_ATTEMPTS - (d.attempts || 0) - 1);
      return res.status(400).json({ error: left ? "Wrong code. " + left + " " + (left === 1 ? "try" : "tries") + " left." : "Too many wrong tries. Tap “Resend code” for a new one." });
    }
    await admin.auth().updateUser(uid, { emailVerified: true });
    await ref.delete();
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("verify-code:", e);
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Couldn't verify right now. Try again shortly." });
  }
};
