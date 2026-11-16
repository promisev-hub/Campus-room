/* CampusRoom — photo → 3D cartoon avatar
 *
 * Goes in the  api/  folder:  api/cartoonize.js
 * Vercel → Project → Settings → Environment Variables (then Redeploy). Use ONE of these:
 *     GEMINI_API_KEY    your Google AI Studio key (also accepts GOOGLE_API_KEY)  ← easiest, you already have one
 *     OPENAI_API_KEY    an OpenAI key (needs OpenAI billing)
 *   optional:
 *     AVATAR_PROVIDER      "gemini" or "openai"   (if you set both keys and want to choose)
 *     GEMINI_IMAGE_MODEL   default gemini-2.5-flash-image
 *     AVATAR_IMAGE_MODEL   default gpt-image-1 (OpenAI)
 *     FIREBASE_API_KEY     default: CampusRoom's public web key
 *
 * Only signed-in CampusRoom users with a verified email can call it, and each person gets a few tries an hour.
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyD3QItVGENqGHpeiWwYBU4jUDG9YFjg9-0";
const OPENAI_MODEL = process.env.AVATAR_IMAGE_MODEL || "gpt-image-1";
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const PER_HOUR = 5;

const PROMPT =
  "Turn the person in this photo into a friendly 3D animated-movie style character portrait " +
  "(soft, polished, Pixar-like rendering). Keep their real likeness: face shape, exact skin tone, " +
  "hairstyle and natural hair texture, hair colour, facial hair, glasses and any headwear or headphones. " +
  "Head and shoulders, centred, looking at the camera with a natural friendly expression, " +
  "plain simple solid-colour background, soft studio lighting. No text, no logos, no watermark. " +
  "Suitable as a square profile picture.";

const tries = new Map();          // uid -> [timestamps]  (per warm instance — a best-effort limit)

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
function provider(){
  const want = String(process.env.AVATAR_PROVIDER || "").toLowerCase();
  if(want === "gemini" && geminiKey()) return "gemini";
  if(want === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if(process.env.OPENAI_API_KEY) return "openai";
  if(geminiKey()) return "gemini";
  return "";
}

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

/* ── OpenAI ── */
async function openaiCall(buf, mime, withFidelity){
  const fd = new FormData();
  fd.append("model", OPENAI_MODEL);
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
async function viaOpenAI(buf, mime){
  let r = await openaiCall(buf, mime, OPENAI_MODEL === "gpt-image-1");
  if(r.status === 400){                       // some model versions don't take input_fidelity — retry plainly
    const t = await r.clone().text();
    if(/input_fidelity/i.test(t)) r = await openaiCall(buf, mime, false);
  }
  const j = await r.json().catch(() => ({}));
  if(!r.ok){
    const msg = (j && j.error && j.error.message) || "";
    console.log("openai error", r.status, msg);
    if(/safety|moderation|policy/i.test(msg)) return { code: 422, error: "That photo couldn’t be used. Try a clear photo of just your face." };
    if(r.status === 429) return { code: 429, error: "The cartoon maker is busy right now. Try again later." };
    return { code: 502, error: "The cartoon maker is busy. Try again in a moment." };
  }
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
  return b64 ? { image: "data:image/jpeg;base64," + b64 } : { code: 502, error: "No picture came back. Try again." };
}

/* ── Gemini ── */
async function viaGemini(buf, mime){
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(GEMINI_MODEL) + ":generateContent";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: buf.toString("base64") } }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){
    const msg = (j && j.error && j.error.message) || "";
    console.log("gemini error", r.status, msg);
    if(r.status === 429) return { code: 429, error: "The cartoon maker has reached its limit for now. Try again later." };
    if(/safety|blocked|policy/i.test(msg)) return { code: 422, error: "That photo couldn’t be used. Try a clear photo of just your face." };
    return { code: 502, error: "The cartoon maker is busy. Try again in a moment." };
  }
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.map(p => p.inlineData || p.inline_data).find(d => d && d.data);
  if(!img){
    console.log("gemini returned no image", JSON.stringify((j.promptFeedback || {})), ((j.candidates || [])[0] || {}).finishReason);
    return { code: 422, error: "That photo couldn’t be turned into a cartoon. Try a clearer photo of your face." };
  }
  return { image: "data:" + (img.mimeType || img.mime_type || "image/png") + ";base64," + img.data };
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return fail(res, 405, "Use POST.");
  const which = provider();
  if(!which) return fail(res, 503, "The cartoon maker isn’t switched on yet.");

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
    const out = which === "gemini" ? await viaGemini(buf, m[1]) : await viaOpenAI(buf, m[1]);
    if(out.error) return fail(res, out.code || 502, out.error);
    return res.status(200).json({ image: out.image });
  }catch(e){
    console.log("cartoonize failed", e && e.message);
    return fail(res, 502, "Something went wrong. Try again.");
  }
};

function safeJson(s){ try{ return JSON.parse(s); }catch(e){ return {}; } }
