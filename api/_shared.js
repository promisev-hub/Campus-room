// Shared helpers for the email-code endpoints (files starting with "_" are not exposed as routes by Vercel).
const admin = require("firebase-admin");
const crypto = require("crypto");

const SA = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(SA) });

const db = admin.firestore();
const SECRET = process.env.CODE_SECRET || SA.private_key || "change-me";

const hash = (uid, code) => crypto.createHmac("sha256", SECRET).update(uid + ":" + code).digest("hex");

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return true; }
  return false;
}

// The caller must be signed in: we only ever send a code to the email on THEIR account.
async function authUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) { const e = new Error("Please sign in again."); e.status = 401; throw e; }
  try { return await admin.auth().verifyIdToken(m[1]); }
  catch (_) { const e = new Error("Your session expired. Sign in again."); e.status = 401; throw e; }
}

module.exports = { admin, db, hash, cors, authUser, crypto };
