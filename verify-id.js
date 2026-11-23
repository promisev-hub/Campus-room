/* CampusRoom — AI pre-check of a student / alumni verification document
 *
 * Goes in the  api/  folder:  api/verify-id.js
 * Uses the same Gemini key as your other AI features (GEMINI_API_KEY or GOOGLE_API_KEY) in Vercel → Environment Variables.
 *   optional:  GEMINI_VISION_MODEL (default gemini-2.5-flash)
 *
 * This is only a HELPER for the state rep. It never approves anyone — a person always decides.
 * The photo is read once and is not stored here.
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyD3QItVGENqGHpeiWwYBU4jUDG9YFjg9-0";
const MODEL = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
const PER_DAY = 8;
const tries = new Map();                                       // uid -> [timestamps] (best-effort, per warm instance)
const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";

function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}
const fail = (res, code, error) => res.status(code).json({ error });
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

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
  return u && u.localId ? { uid: u.localId } : null;
}
function allowed(uid){
  const now = Date.now(), list = (tries.get(uid) || []).filter(t => now - t < 86400000);
  if(list.length >= PER_DAY){ tries.set(uid, list); return false; }
  list.push(now); tries.set(uid, list);
  if(tries.size > 5000) for(const k of tries.keys()){ tries.delete(k); break; }
  return true;
}

const PROOF = { "student-id": "a student ID card", "admission": "an admission letter or school fees receipt", "certificate": "a certificate or result slip (for an alumnus)" };

function promptFor(b){
  return "You are helping a Nigerian university community app PRE-CHECK a document that a person uploaded to prove they are a " +
    (b.role === "Alumni" ? "graduate (alumnus/alumna)" : "student") + ". A human state representative makes the final decision; you only give a short helpful read.\n" +
    "The person says: name = \"" + clip(b.name, 80) + "\", school = \"" + clip(b.school, 120) + "\", document = " + (PROOF[b.proof] || "an academic document") + ".\n" +
    "Look at the image and answer ONLY with JSON using exactly these keys:\n" +
    "{\"readable\": boolean, \"documentType\": \"student_id\"|\"admission_letter\"|\"fees_receipt\"|\"certificate\"|\"result\"|\"other\"|\"not_a_document\", " +
    "\"nameOnDocument\": string, \"schoolOnDocument\": string, \"nameMatches\": \"yes\"|\"no\"|\"unclear\", \"schoolMatches\": \"yes\"|\"no\"|\"unclear\", " +
    "\"looksEdited\": boolean, \"concerns\": string[] (max 4 short items), \"verdict\": \"likely_valid\"|\"unclear\"|\"likely_invalid\", \"summary\": string (max 140 characters)}\n" +
    "Rules: never guess text you cannot read — use \"unclear\" and an empty string. \"looksEdited\" is true only for clear signs like mismatched fonts, pasted-over text, or an obvious template. " +
    "Do not output anything except the JSON.";
}

const ENUM = (v, list, dflt) => list.includes(v) ? v : dflt;
function clean(o){
  o = o && typeof o === "object" ? o : {};
  return {
    readable: !!o.readable,
    documentType: ENUM(o.documentType, ["student_id", "admission_letter", "fees_receipt", "certificate", "result", "other", "not_a_document"], "other"),
    nameOnDocument: clip(o.nameOnDocument, 80),
    schoolOnDocument: clip(o.schoolOnDocument, 120),
    nameMatches: ENUM(o.nameMatches, ["yes", "no", "unclear"], "unclear"),
    schoolMatches: ENUM(o.schoolMatches, ["yes", "no", "unclear"], "unclear"),
    looksEdited: !!o.looksEdited,
    concerns: (Array.isArray(o.concerns) ? o.concerns : []).slice(0, 4).map(x => clip(x, 90)).filter(Boolean),
    verdict: ENUM(o.verdict, ["likely_valid", "unclear", "likely_invalid"], "unclear"),
    summary: clip(o.summary, 140)
  };
}
function parseJson(t){
  t = String(t || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try{ return JSON.parse(t); }catch(e){
    const a = t.indexOf("{"), z = t.lastIndexOf("}");
    if(a >= 0 && z > a){ try{ return JSON.parse(t.slice(a, z + 1)); }catch(x){} }
    return null;
  }
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return fail(res, 405, "Use POST.");
  if(!geminiKey()) return fail(res, 503, "The AI check isn’t switched on yet.");

  let user;
  try{ user = await verifyUser(req); }catch(e){ return fail(res, 502, "Couldn’t check your sign-in."); }
  if(!user) return fail(res, 401, "Please sign in again.");
  if(!allowed(user.uid)) return fail(res, 429, "Too many checks today. Try again tomorrow.");

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ""));
  if(!m) return fail(res, 400, "Send a JPEG, PNG or WebP photo.");
  if(m[2].length > 4 * 1024 * 1024) return fail(res, 413, "That photo is too big.");

  try{
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptFor(body) }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
      })
    });
    const j = await r.json().catch(() => ({}));
    if(!r.ok){
      console.log("gemini vision error", r.status, (j.error && j.error.message) || "");
      return fail(res, r.status === 429 ? 429 : 502, r.status === 429 ? "The AI check is busy. Try again later." : "The AI check couldn’t run.");
    }
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const parsed = parseJson(parts.map(p => p.text || "").join(""));
    if(!parsed) return fail(res, 502, "The AI check gave no answer.");
    return res.status(200).json({ ai: clean(parsed) });
  }catch(e){
    console.log("verify-id failed", e && e.message);
    return fail(res, 502, "The AI check couldn’t run.");
  }
};

function safeJson(s){ try{ return JSON.parse(s); }catch(e){ return {}; } }
