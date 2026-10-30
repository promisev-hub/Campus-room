// POST /api/send-code   (Authorization: Bearer <Firebase ID token>)
// Emails a 6-digit code to the signed-in user's account email (via Brevo).
const { admin, db, hash, cors, authUser, crypto } = require("./_shared");

const COOLDOWN_MS = 45 * 1000;      // minimum gap between emails
const EXPIRES_MS = 10 * 60 * 1000;  // code lifetime
const HOURLY_MAX = 8;               // emails per hour per account

async function sendMail(to, code, name) {
  const first = String(name || "").split(" ")[0] || "there";
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1a0030">
    <h2 style="margin:0 0 8px">Verify your CampusRoom email</h2>
    <p>Hi ${first.replace(/[<>&]/g, "")}, enter this code in the app:</p>
    <p style="font-size:36px;letter-spacing:10px;font-weight:800;background:#f3ecff;border-radius:12px;padding:14px 0;text-align:center;margin:18px 0">${code}</p>
    <p style="color:#666;font-size:13px">It expires in 10 minutes. If you didn't create a CampusRoom account, ignore this email.</p></div>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "CampusRoom", email: process.env.SENDER_EMAIL },
      to: [{ email: to }],
      subject: code + " is your CampusRoom code",
      htmlContent: html,
      textContent: "Your CampusRoom verification code is " + code + ". It expires in 10 minutes."
    })
  });
  if (!r.ok) throw new Error("Email provider error " + r.status + ": " + (await r.text()));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const { uid } = await authUser(req);
    const user = await admin.auth().getUser(uid);
    if (user.emailVerified) return res.status(200).json({ ok: true, alreadyVerified: true });
    if (!user.email) return res.status(400).json({ error: "This account has no email address." });

    const ref = db.collection("emailCodes").doc(uid), now = Date.now();
    const snap = await ref.get(), d = snap.exists ? snap.data() : {};
    if (d.sentAt && now - d.sentAt < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - d.sentAt)) / 1000);
      return res.status(429).json({ error: "Please wait " + wait + "s before asking for another code.", retryAfter: wait });
    }
    const fresh = d.hourStart && now - d.hourStart < 3600000;
    const count = fresh ? (d.hourCount || 0) : 0;
    if (count >= HOURLY_MAX) return res.status(429).json({ error: "Too many codes requested. Try again in an hour.", retryAfter: 3600 });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await sendMail(user.email, code, user.displayName);
    await ref.set({ hash: hash(uid, code), expiresAt: now + EXPIRES_MS, attempts: 0, sentAt: now, hourStart: fresh ? d.hourStart : now, hourCount: count + 1 });
    return res.status(200).json({ ok: true, cooldown: COOLDOWN_MS / 1000, expiresIn: EXPIRES_MS / 1000 });
  } catch (e) {
    console.error("send-code:", e);
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Couldn't send the email. Try again shortly." });
  }
};
