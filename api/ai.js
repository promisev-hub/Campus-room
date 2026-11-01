/* CampusRoom AI — Vercel serverless function (Node 18+).
   Put this file at  api/ai.js  in the root of your repo.

   POST /api/ai       headers: Authorization: Bearer <Firebase ID token of the signed-in user>

   Chat mode (default)
     body:    { messages: [{ role, content }], context: { name, role, inst, faculty, dept, level, tab, schedule } }
     returns: { reply }  or  { error }

   Quiz mode
     body:    { mode: "quiz", text, topic, course, count (1-10), type: "objective" | "theory", beyond: true|false, avoid: [question stems] }
     returns: { questions: [...] }  or  { error }
        objective question: { q, options: [4 strings], correct: 0-3 }
        theory question:    { q, answer }

   Vercel → Project → Settings → Environment Variables:
     GEMINI_API_KEY      free key from aistudio.google.com  (main AI)
     GROQ_API_KEY        (optional) free key from console.groq.com — used only if Gemini fails or is busy
     FIREBASE_API_KEY    the "apiKey" value already in your Firebase config in index.html
     AI_MODEL            (optional) Gemini model, defaults to gemini-3.8-flash
     AI_QUIZ_MODEL       (optional) Gemini model for quizzes; defaults to AI_MODEL
     GROQ_MODEL          (optional) defaults to openai/gpt-oss-120b
     ALLOWED_ORIGINS     (optional) comma-separated sites allowed to call this
*/

const MODEL = process.env.AI_MODEL || "gemini-3.8-flash";
const QUIZ_MODEL = process.env.AI_QUIZ_MODEL || MODEL;
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://campusroom-delta.vercel.app,https://promisev-hub.github.io")
  .split(",").map(s => s.trim()).filter(Boolean);
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { chat: 20, quiz: 12 };                 // per person per 10 minutes (per warm server) — kept low so the free daily quota lasts
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

function tooMany(uid, bucket){
  const key = bucket + ":" + uid, now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  if(list.length >= LIMITS[bucket]){ hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  if(hits.size > 4000) hits.clear();
  return false;
}

const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n);

/* ───────────── chat ───────────── */
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

/* merges back-to-back messages from the same side and makes sure the last message is the student's */
function alternate(list){
  const out = [];
  list.forEach(m => {
    const last = out[out.length - 1];
    if(last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  });
  while(out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

/* ───────────── quiz ───────────── */
function quizSystem(type, beyond, hasText){
  const lines = [
    "You write exam questions for students at Nigerian universities, polytechnics and colleges of education.",
    "Accuracy comes first: only write a question when you are certain of the correct answer. Never invent facts, names or figures.",
    "Every question must be different from the others — different concept, different wording. Never repeat or rephrase a question from the \"already asked\" list.",
    "Write each question so it makes sense on its own (do not say \"according to the text\" or \"in the passage\").",
    hasText
      ? (beyond
          ? "You are given study material. Roughly two thirds of the questions must come from the material; the rest should test the same topic with related concepts, applications or examples that are NOT stated in the material but are standard, correct course knowledge."
          : "You are given study material. Every question must be answerable from that material only.")
      : "You are given only a topic. Write questions from standard, correct course knowledge on that topic."
  ];
  if(type === "theory"){
    lines.push(
      "Write THEORY questions: questions that need a written answer (explain, describe, differentiate, state and discuss, give examples, solve and show working). Do not write multiple-choice questions.",
      "For each question give a model answer a lecturer could mark against: 2 to 6 short sentences or key points. Keep it accurate and complete but concise.",
      "Reply with ONLY JSON, no other text: {\"questions\":[{\"q\":\"...\",\"answer\":\"...\"}]}"
    );
  }else{
    lines.push(
      "Write OBJECTIVE (multiple-choice) questions with exactly 4 options and exactly one correct option.",
      "Make the wrong options plausible but clearly wrong. Never use \"all of the above\" or \"none of the above\". Do not put option letters inside the options.",
      "Vary the style: definitions, application, cause and effect, \"which of the following is NOT…\", short calculations.",
      "Reply with ONLY JSON, no other text: {\"questions\":[{\"q\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"correct\":0}]} where correct is the index (0-3) of the right option."
    );
  }
  return lines.join("\n");
}

function shuffle(a){ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* pulls the JSON out of the model's reply and keeps only well-formed, non-repeating questions */
function parseQuiz(raw, type){
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  let data = null;
  try{ data = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); }catch(e){
    const x = s.indexOf("["), y = s.lastIndexOf("]");
    try{ data = { questions: JSON.parse(s.slice(x, y + 1)) }; }catch(e2){ return []; }
  }
  const list = Array.isArray(data) ? data : (data && data.questions);
  if(!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  list.forEach(it => {
    if(!it || typeof it.q !== "string") return;
    const q = it.q.replace(/\s+/g, " ").trim();
    if(q.length < 8 || q.length > 400) return;
    const key = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if(seen.has(key)) return;
    if(type === "theory"){
      const answer = typeof it.answer === "string" ? it.answer.replace(/[ \t]+/g, " ").trim() : "";
      if(answer.length < 10 || answer.length > 1200) return;
      seen.add(key); out.push({ q, type: "theory", answer });
    }else{
      if(!Array.isArray(it.options) || it.options.length !== 4) return;
      const opts = it.options.map(o => String(o == null ? "" : o).replace(/\s+/g, " ").trim());
      if(opts.some(o => !o || o.length > 220) || new Set(opts.map(o => o.toLowerCase())).size !== 4) return;
      if(opts.some(o => /^(all|none) of the above$/i.test(o))) return;
      const c = Number(it.correct);
      if(!Number.isInteger(c) || c < 0 || c > 3) return;
      const right = opts[c], mixed = shuffle(opts);                // the model likes putting the answer first — shuffle it
      seen.add(key); out.push({ q, options: mixed, correct: mixed.indexOf(right) });
    }
  });
  return out;
}

/* ───────────── AI providers ───────────── */
async function gemini(model, system, messages, max, json){
  const gen = { maxOutputTokens: max, temperature: json ? 0.6 : 0.7 };
  if(json) gen.responseMimeType = "application/json";
  if(/gemini-3/.test(model)) gen.thinkingConfig = { thinkingLevel: "low" };    // little hidden "thinking": faster, and uses less of the free quota
  else if(/2\.5-flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: gen
    })
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) return { ok: false, status: r.status, err: d.error };
  const c = d.candidates && d.candidates[0];
  const parts = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
  return { ok: true, text: parts.filter(p => !p.thought).map(p => p.text || "").join("\n").trim() };
}

async function groq(system, messages, max){
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const body = { model, max_completion_tokens: max, temperature: 0.6, messages: [{ role: "system", content: system }].concat(messages) };
  if(/gpt-oss/.test(model)) body.reasoning_effort = "low";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_API_KEY },
    body: JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) return { ok: false, status: r.status, err: d.error };
  const m = d.choices && d.choices[0] && d.choices[0].message;
  return { ok: true, text: m ? String(m.content || "").trim() : "" };
}

/* tries Gemini first, then Groq (if you added a Groq key). Throws if both fail. */
async function complete(o){
  const messages = alternate(o.messages);
  if(!messages.length){ const e = new Error("no messages"); e.ai = true; throw e; }
  let last = null;
  if(process.env.GEMINI_API_KEY){
    const r = await gemini(o.model, o.system, messages, o.max, !!o.json);
    if(r.ok && r.text) return r.text;
    console.error("Gemini error", r.status, r.err || "(empty reply)");
    last = r;
  }
  if(process.env.GROQ_API_KEY){
    const r = await groq(o.system, messages, o.max + 1000);   // extra room because gpt-oss spends some tokens on reasoning
    if(r.ok && r.text) return r.text;
    console.error("Groq error", r.status, r.err || "(empty reply)");
    last = r;
  }
  const e = new Error("ai failed");
  e.ai = true; e.busy = !!(last && last.status === 429);
  throw e;
}

async function quiz(body, res){
  const type = body.type === "theory" ? "theory" : "objective";
  const count = Math.max(1, Math.min(10, parseInt(body.count, 10) || 5));
  const text = String(body.text || "").replace(/[ \t]+/g, " ").trim().slice(0, 7000);
  const topic = clip(body.topic, 160), course = clip(body.course, 60);
  const hasText = text.length >= 200;
  if(!hasText && !topic && text.length < 4){ res.status(400).json({ error: "Give me some notes or a topic first." }); return; }
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(-60).map(v => clip(v, 140)).filter(Boolean);
  const beyond = !!body.beyond && hasText;
  const user = [
    `Write ${count} ${type === "theory" ? "theory" : "objective"} question${count > 1 ? "s" : ""}.`,
    course && "Course: " + course,
    topic && "Topic: " + topic,
    hasText ? "STUDY MATERIAL:\n" + text : (text ? "Topic notes: " + text : ""),
    avoid.length ? "ALREADY ASKED (do not repeat or rephrase any of these):\n- " + avoid.join("\n- ") : ""
  ].filter(Boolean).join("\n\n");
  const raw = await complete({ model: QUIZ_MODEL, system: quizSystem(type, beyond, hasText), messages: [{ role: "user", content: user }], max: type === "theory" ? 5500 : 4000, json: true });
  const questions = parseQuiz(raw, type);
  res.status(200).json({ questions });
}

/* ───────────── handler ───────────── */
module.exports = async function handler(req, res){
  cors(req, res);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){ res.status(405).json({ error: "Use POST." }); return; }

  try{
    const auth = String(req.headers.authorization || "");
    const uid = await verify(auth.startsWith("Bearer ") ? auth.slice(7) : "");
    if(!uid){ res.status(401).json({ error: "Please sign in again." }); return; }
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mode = body.mode === "quiz" ? "quiz" : "chat";
    if(tooMany(uid, mode)){ res.status(429).json({ error: "You're asking very fast — wait a few minutes and try again." }); return; }
    if(!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY){ console.error("No AI key set (GEMINI_API_KEY or GROQ_API_KEY)"); res.status(503).json({ error: "The AI is still being set up. Please try again later." }); return; }

    if(mode === "quiz"){ await quiz(body, res); return; }

    const messages = cleanMessages(body.messages);
    if(!messages.length){ res.status(400).json({ error: "Ask me something first." }); return; }
    const reply = await complete({ model: MODEL, system: systemPrompt(body.context), messages, max: 1200 });
    res.status(200).json({ reply });
  }catch(e){
    console.error("ai handler", e);
    if(e && e.ai){
      res.status(502).json({ error: e.busy ? "The AI is very busy right now. Please try again in a little while." : "The AI had a problem. Please try again." });
      return;
    }
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

module.exports._test = { cleanMessages, alternate, systemPrompt, parseQuiz, quizSystem };
