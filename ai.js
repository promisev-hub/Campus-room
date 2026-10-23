/* CampusRoom AI — Vercel serverless function (Node 18+).
   Put this file at  api/ai.js  in the root of your repo (next to index.html).

   POST /api/ai
     headers: Authorization: Bearer <Firebase ID token of the signed-in user>
     body:    { messages: [{ role, content }], context: { name, role, inst, faculty, dept, level, tab, schedule } }
     returns: { reply }  or  { error }

   Vercel → Project → Settings → Environment Variables:
     ANTHROPIC_API_KEY   your key from console.anthropic.com
     FIREBASE_API_KEY    the "apiKey" value already in your Firebase config in index.html
     AI_MODEL            (optional) defaults to claude-haiku-5-5
     ALLOWED_ORIGINS     (optional) comma-separated sites allowed to call this
*/

const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://campusroom-delta.vercel.app,https://promisev-hub.github.io")
  .split(",").map(s => s.trim()).filter(Boolean);
const LIMIT = 25, WINDOW_MS = 10 * 60 * 1000;          // 25 questions per person per 10 minutes (per warm server)
const hits = new Map();

function cors(req, res){
  const o = req.headers.origin;
  if(o && ORIGINS.includes(o)){ res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

/* checks the Firebase sign-in token with Google and returns the user's uid (or null) */
async function verify(token){
  if(!token || !process.env.FIREBASE_API_KEY) return null;
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(process.env.FIREBASE_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token })
  });
  if(!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.users && d.users[0] ? d.users[0].localId : null;
}

function tooMany(uid){
  const now = Date.now(), list = (hits.get(uid) || []).filter(t => now - t < WINDOW_MS);
  if(list.length >= LIMIT){ hits.set(uid, list); return true; }
  list.push(now); hits.set(uid, list);
  if(hits.size > 2000) hits.clear();
  return false;
}

const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n);

function systemPrompt(c){
  c = c || {};
  const who = [
    c.name && "Name: " + clip(c.name, 60), c.role && "Role: " + clip(c.role, 30), c.inst && "Institution: " + clip(c.inst, 120),
    c.faculty && "Faculty: " + clip(c.faculty, 80), c.dept && "Department: " + clip(c.dept, 80), c.level && "Level: " + clip(c.level, 20),
    c.schedule && "Class schedule: " + clip(c.schedule, 300), c.tab && "Currently viewing the \"" + clip(c.tab, 20) + "\" section of the app"
  ].filter(Boolean).join("\n");
  return [
    "You are CampusRoom AI, a friendly study and campus-life assistant inside CampusRoom, a social app for students in Nigeria (universities, polytechnics and colleges of education).",
    "You can explain topics simply, quiz students, make revision timetables, help write posts, captions, messages and announcements, and give study and campus-life tips.",
    "The app has these sections: Home (feed), Reels, a study space, Chat and Settings. If you are not sure how a feature works, say so instead of guessing.",
    "Be warm, clear and concise. Use simple English, short paragraphs or short lists. Use Nigerian campus examples when they help.",
    "Never ask for passwords, PINs or card details, and tell students not to share them. Do not claim to see anything about the student beyond the details below.",
    "",
    who ? "About the student you are talking to:\n" + who : ""
  ].join("\n").trim();
}

function cleanMessages(list){
  const out = [];
  (Array.isArray(list) ? list : []).slice(-12).forEach(m => {
    if(!m || (m.role !== "user" && m.role !== "assistant")) return;
    const content = String(m.content == null ? "" : m.content).slice(0, 2000).trim();
    if(content) out.push({ role: m.role, content });
  });
  while(out.length && out[0].role !== "user") out.shift();       // the conversation must start with the student
  return out;
}

module.exports = async function handler(req, res){
  cors(req, res);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){ res.status(405).json({ error: "Use POST." }); return; }

  try{
    const auth = String(req.headers.authorization || "");
    const uid = await verify(auth.startsWith("Bearer ") ? auth.slice(7) : "");
    if(!uid){ res.status(401).json({ error: "Please sign in again." }); return; }
    if(tooMany(uid)){ res.status(429).json({ error: "You're asking very fast — wait a few minutes and try again." }); return; }
    if(!process.env.ANTHROPIC_API_KEY){ console.error("ANTHROPIC_API_KEY is not set"); res.status(503).json({ error: "The AI is still being set up. Please try again later." }); return; }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const messages = cleanMessages(body.messages);
    if(!messages.length){ res.status(400).json({ error: "Ask me something first." }); return; }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: systemPrompt(body.context), messages })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok){
      console.error("Anthropic error", r.status, d && d.error);
      res.status(502).json({ error: "The AI had a problem. Please try again." });
      return;
    }
    const reply = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if(!reply){ res.status(502).json({ error: "The AI didn't answer. Please try again." }); return; }
    res.status(200).json({ reply });
  }catch(e){
    console.error("ai handler", e);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

module.exports._test = { cleanMessages, systemPrompt };
