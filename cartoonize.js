/* CampusRoom — photo → 3D cartoon avatar
 *
 * Put this file at  api/cartoonize.js  in the same Vercel project as your other /api functions.
 * Vercel → Project → Settings → Environment Variables:
 *     OPENAI_API_KEY   (required)   your OpenAI key. Also set a monthly spend limit in the OpenAI dashboard.
 *     AVATAR_IMAGE_MODEL (optional) defaults to gpt-image-1
 *     FIREBASE_API_KEY   (optional) defaults to CampusRoom's public web key
 *
 * Only signed-in CampusRoom users with a verified email can call it, and each person is limited to a few tries.
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyD3QItVGENqGHpeiWwYBU4jUDG9YFjg9-0";
const MODEL = process.env.AVATAR_IMAGE_MODEL || "gpt-image-1";
const PER_HOUR = 5;

const PROMPT =
  "Turn the person in this photo into a friendly 3D animated-movie style character portrait " +
  "(soft, polished, Pixar-like rendering). Keep their real likeness: face shape, exact skin tone, " +
  "hairstyle and natural hair texture, hair colour, facial hair, glasses and any headwear or headphones. " +
  "Head and shoulders, centred, looking at the camera with a natural friendly expression, " +
  "plain simple solid-colour background, soft studio lighting. No text, no logos, no watermark. " +
  "Suitable as a square profile picture.";

const tries = new Map();          // uid -> [timestamps]  (per warm instance — a best-effort limit)

function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}
const fail = (res, code, error) => res.status(code).json({ error });

async function verifyUser(req){
  const h = String(req.headers.authorization || "");
  const idToken = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if(!idToken) return null;
  const headers = { "Content-Type": "application/json" };
  if(req.headers.origin) headers.Referer = req.headers.origin + "/";
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_API_KEY), {
    method: "POST", headers, body: JSON.stringify({ idToken })
  });
  if(!r.ok) return null;
  const j = await r.json().catch(() => null);
  const u = j && j.users && j.users[0];
  return u && u.localId ? { uid: u.localId, verified: !!u.emailVerified } : null;
}

function allowed(uid){
  const now = Date.now(), list = (tries.get(uid) || []).filter(t => now - t < 3600000);
  if(list.length >= PER_HOUR){ tries.set(uid, list); return false; }
  list.push(now); tries.set(uid, list);
  if(tries.size > 5000) for(const k of tries.keys()){ tries.delete(k); break; }
  return true;
}

async function callOpenAI(buf, mime, withFidelity){
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append("prompt", PROMPT);
  fd.append("image", new Blob([buf], { type: mime }), "photo." + (mime === "image/png" ? "png" : "jpg"));
  fd.append("size", "1024x1024");
  fd.append("quality", "low");
  fd.append("output_format", "jpeg");
  fd.append("output_compression", "80");
  fd.append("n", "1");
  if(withFidelity) fd.append("input_fidelity", "high");
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY }, body: fd
  });
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return fail(res, 405, "Use POST.");
  if(!process.env.OPENAI_API_KEY) return fail(res, 503, "The cartoon maker isn’t switched on yet.");

  let user;
  try{ user = await verifyUser(req); }catch(e){ return fail(res, 502, "Couldn’t check your sign-in. Try again."); }
  if(!user) return fail(res, 401, "Please sign in again.");
  if(!user.verified) return fail(res, 403, "Verify your email first.");
  if(!allowed(user.uid)) return fail(res, 429, "You’ve made a few avatars already. Try again in an hour.");

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ""));
  if(!m) return fail(res, 400, "Send a JPEG, PNG or WebP photo.");
  const buf = Buffer.from(m[2], "base64");
  if(buf.length < 2000 || buf.length > 3 * 1024 * 1024) return fail(res, 413, "That photo is too big or too small.");

  try{
    let r = await callOpenAI(buf, m[1], MODEL === "gpt-image-1");
    if(r.status === 400){                       // some model versions don't take input_fidelity — retry plainly
      const t = await r.clone().text();
      if(/input_fidelity/i.test(t)) r = await callOpenAI(buf, m[1], false);
    }
    const j = await r.json().catch(() => ({}));
    if(!r.ok){
      const msg = (j && j.error && j.error.message) || "";
      console.log("openai error", r.status, msg);
      if(/safety|moderation|policy/i.test(msg)) return fail(res, 422, "That photo couldn’t be used. Try a clear photo of just your face.");
      return fail(res, 502, "The cartoon maker is busy. Try again in a moment.");
    }
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if(!b64) return fail(res, 502, "No picture came back. Try again.");
    return res.status(200).json({ image: "data:image/jpeg;base64," + b64 });
  }catch(e){
    console.log("cartoonize failed", e && e.message);
    return fail(res, 502, "Something went wrong. Try again.");
  }
};

function safeJson(s){ try{ return JSON.parse(s); }catch(e){ return {}; } }
module.exports.config = { maxDuration: 60 };
