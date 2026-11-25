/* CampusRoom — ranking algorithms
 *
 *  1) Home › For You       posts are scored (not just "newest first")
 *  2) People you may know  people are scored and shown as a strip on Home + a list in Messages › Friends
 *
 *  What counts (your choices):  same school & course · friends · likes, comments & watch time
 *  Everything is tunable without re-deploying: put numbers in Firestore  config/ranking  (see CFG below).
 *  Open the console and type  crRank.why("<postId>")  to see why a post got its score.
 *
 * Loaded with <script src="algorithms.js" defer></script> in index.html.
 */
(function(){
"use strict";

/* ───────── helpers ───────── */
const $ = id => document.getElementById(id);
const S = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const me = () => { try{ return typeof CU !== "undefined" ? CU : null; }catch(e){ return null; } };
const dbx = () => { try{ return typeof db !== "undefined" ? db : null; }catch(e){ return null; } };
const friends = () => { try{ return typeof myFriends !== "undefined" ? myFriends : new Set(); }catch(e){ return new Set(); } };
const cache = () => (window.crPostCache && window.crPostCache.get) ? window.crPostCache : new Map();
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const remo = r => { try{ return (typeof REMO !== "undefined" && REMO[r]) || "👤"; }catch(e){ return "👤"; } };
const jget = (k, d) => { try{ const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; }catch(e){ return d; } };
const jset = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

/* ───────── the knobs ───────── */
const CFG = {
  feed: {
    w: { recency: 0.30, engage: 0.18, social: 0.20, school: 0.18, affinity: 0.14 },
    halfLifeHours: 20,       // how fast a post "ages"
    ownBoost: 0.40,          // your own post stays near the top for the first hour
    friendFresh: 0.10,       // a friend's brand-new post gets a small lift
    seenPenalty: 0.15,       // things you already scrolled past sink a little on the next refresh
    sameAuthorPenalty: 0.12  // spread authors out (no wall of one person)
  },
  pymk: { mutual: 3, mutualCap: 5, dept: 4, inst: 2.5, faculty: 1, level: 1, state: 1.5, lga: 1, role: 0.5, verified: 0.5, max: 12 }
};
function mergeNums(into, from){
  if(!from || typeof from !== "object") return;
  Object.keys(into).forEach(k => {
    if(typeof into[k] === "number" && typeof from[k] === "number" && isFinite(from[k])) into[k] = from[k];
    else if(into[k] && typeof into[k] === "object" && !Array.isArray(into[k])) mergeNums(into[k], from[k]);
  });
}
async function loadRemoteCfg(){
  const d = dbx(); if(!d) return;
  try{ const s = await d.collection("config").doc("ranking").get(); if(s.exists) mergeNums(CFG, s.data()); }catch(e){}
}

/* ───────── what this person likes: affinity from likes, comments and watch time (kept on the phone) ───────── */
let AFF = null;
const affKey = () => "cr_aff_v1_" + ((me() || {}).uid || "");
function affLoad(){ if(AFF) return; const v = jget(affKey(), {}); AFF = v && typeof v === "object" ? v : {}; }
function affScore(uid){ affLoad(); const a = AFF[uid]; if(!a) return 0; return a.s * Math.pow(0.5, (Date.now() - a.t) / 86400000 / 14); }   // fades with a 14-day half-life
let affT = 0;
function bump(uid, pts){
  const u = me(); if(!uid || !u || uid === u.uid) return;
  affLoad(); AFF[uid] = { s: Math.min(30, affScore(uid) + pts), t: Date.now() };
  clearTimeout(affT); affT = setTimeout(() => {
    const keys = Object.keys(AFF); if(keys.length > 200){ keys.sort((a, b) => affScore(b) - affScore(a)).slice(200).forEach(k => delete AFF[k]); }
    jset(affKey(), AFF);
  }, 1500);
}
const postIdOf = el => { const c = el && el.closest && el.closest(".feed-post,.hv-card"); const b = c && c.querySelector(".lbtn[data-id]"); return b ? b.dataset.id : ""; };

// likes
(function(){
  const orig = window.crToggleLike; if(typeof orig !== "function" || orig.__alg) return;
  const w = async function(postId, ownerUid, btn){
    const r = await orig.apply(this, arguments);
    try{ if(btn && btn.classList.contains("lk")) bump(ownerUid, 3); }catch(e){}
    return r;
  };
  w.__alg = true; window.crToggleLike = w;
})();
// opening the comments
document.addEventListener("click", e => {
  const c = e.target.closest && e.target.closest(".cr-cm[data-id]"); if(!c) return;
  const p = cache().get(c.dataset.id); if(p) bump(p.uid, 1.5);
}, true);
// watch time — only counts when the person chose to watch (sound on, or the Home video list), not silent autoplay
const PLAY = new WeakMap();
document.addEventListener("play", e => { const v = e.target; if(v && v.tagName === "VIDEO") PLAY.set(v, performance.now()); }, true);
const stopWatch = e => {
  const v = e.target; if(!v || v.tagName !== "VIDEO") return;
  const t0 = PLAY.get(v); if(!t0) return; PLAY.delete(v);
  const sec = (performance.now() - t0) / 1000; if(sec < 3) return;
  if(v.muted && !v.closest("#cr-hv")) return;
  const p = cache().get(postIdOf(v)); if(!p) return;
  bump(p.uid, Math.min(3, sec / 10) + ((v.duration && v.currentTime / v.duration > 0.8) ? 2 : 0));
};
document.addEventListener("pause", stopWatch, true);
document.addEventListener("ended", stopWatch, true);

/* ───────── profiles (school / course / state / friends) of the people we rank ───────── */
const PROF = new Map();
async function fetchProfiles(ids, full){
  const d = dbx(); if(!d) return [];
  const need = [...new Set(ids)].filter(id => id && (!PROF.has(id) || (full && !PROF.get(id)._full)));
  for(let i = 0; i < need.length; i += 10){
    try{
      const s = await d.collection("users").where(firebase.firestore.FieldPath.documentId(), "in", need.slice(i, i + 10)).get();
      s.forEach(x => { const v = x.data(); PROF.set(x.id, { uid: x.id, name: v.name, username: v.username, photoURL: v.photoURL, role: v.role, inst: v.inst, faculty: v.faculty, dept: v.dept, level: v.level, state: v.state, lga: v.lga, verified: v.verified === true, friends: Array.isArray(v.friends) ? v.friends.slice(0, 300) : [], _full: true }); });
    }catch(e){}
  }
  return ids.map(id => PROF.get(id)).filter(Boolean);
}

/* ═════════ 1) HOME › FOR YOU ═════════ */
function schoolMatch(a, m){            // 1 = same school & course · .75 = same faculty · .55 = same school
  if(!a || !m || !a.inst || !m.inst || norm(a.inst) !== norm(m.inst)) return 0;
  if(a.dept && m.dept && norm(a.dept) === norm(m.dept)) return 1;
  if(a.faculty && m.faculty && norm(a.faculty) === norm(m.faculty)) return 0.75;
  return 0.55;
}
function scorePost(p, ctx){
  const w = CFG.feed.w, u = ctx.me, ts = p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : ctx.now;
  const ageH = Math.max(0, (ctx.now - ts) / 3600000);
  const prof = ctx.prof.get(p.uid) || {};
  const author = { inst: p.inst || prof.inst, faculty: p.faculty || prof.faculty, dept: p.dept || prof.dept };
  const parts = {
    recency: Math.exp(-ageH / CFG.feed.halfLifeHours),
    engage: Math.min(1, (Math.log(1 + (p.likes || 0)) + 1.6 * Math.log(1 + (p.comments || 0))) / 5),
    social: ctx.friends.has(p.uid) ? 1 : 0,
    school: schoolMatch(author, u),
    affinity: Math.min(1, affScore(p.uid) / 8)
  };
  let score = w.recency * parts.recency + w.engage * parts.engage + w.social * parts.social + w.school * parts.school + w.affinity * parts.affinity;
  if(p.uid === u.uid && ageH < 1) score += CFG.feed.ownBoost;
  else if(parts.social && ageH < 1) score += CFG.feed.friendFresh;
  if(ctx.seen[p.id] && p.uid !== u.uid) score -= CFG.feed.seenPenalty;
  return { score, parts, ageH, partial: !(p.dept || prof.dept || !u.dept) };
}
function diversify(items){                // greedy re-rank: don't show the same person three times in a row
  const left = items.slice(), out = [];
  while(left.length){
    const last = out.slice(-3).map(x => x.p.uid);
    let bi = 0, bs = -1e9;
    left.forEach((it, i) => { const s = it.score - CFG.feed.sameAuthorPenalty * last.filter(x => x === it.p.uid).length; if(s > bs){ bs = s; bi = i; } });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}

let MEMO = new Map();                     // postId -> {score, partial}  (kept so the order doesn't shuffle while you read)
let SEEN = jget("cr_seen_v1", {});
let ordering = false, ordT = 0;
const feedEl = () => $("feed-scroll");
const activeTab = () => ((document.querySelector(".ftab.on") || {}).textContent || "").trim();
function postNodes(feed){ return [...feed.children].filter(n => n.classList && n.classList.contains("feed-post")); }
function idOfNode(n){ const b = n.querySelector(".lbtn[data-id]"); return b ? b.dataset.id : ""; }

function applyOrder(force){
  const feed = feedEl(), u = me(); if(!feed || !u) return;
  const tab = activeTab(); if(tab === "News") return;
  const nodes = postNodes(feed); if(nodes.length < 2){ placeStrip(feed); return; }
  const items = nodes.map(n => ({ n, p: cache().get(idOfNode(n)) })).filter(x => x.p);
  if(items.length < 2){ placeStrip(feed); return; }
  const slots = nodes.map(n => Array.prototype.indexOf.call(feed.children, n));      // keep ads / strips where they are
  let sorted;
  if(tab !== "For You"){
    sorted = items.slice().sort((a, b) => ((b.p.createdAt && b.p.createdAt.seconds) || 0) - ((a.p.createdAt && a.p.createdAt.seconds) || 0));
  }else{
    const ctx = { me: u, friends: friends(), prof: PROF, now: Date.now(), seen: SEEN };
    const scrolled = feed.scrollTop > 200;
    if(force) MEMO = new Map();
    items.forEach(it => {
      const m = MEMO.get(it.p.id);
      if(m && !(m.partial && !scrolled)) { it.score = m.score; return; }
      const r = scorePost(it.p, ctx);
      let sc = r.score;
      if(!m && scrolled && MEMO.size){ const vals = [...MEMO.values()].map(x => x.score).sort((a, b) => a - b); sc = Math.min(sc, vals[Math.floor(vals.length / 2)]); }   // don't push new posts above what you're reading
      MEMO.set(it.p.id, { score: sc, partial: r.partial });
      it.score = sc;
    });
    sorted = diversify(items.slice().sort((a, b) => b.score - a.score));
    const missing = items.filter(it => !PROF.has(it.p.uid) && !it.p.dept && it.p.uid !== u.uid).map(it => it.p.uid);
    if(missing.length) fetchProfiles(missing).then(() => { if(!ordering) schedule(true); });
  }
  const same = sorted.every((it, i) => it.n === items[i].n);
  if(!same){
    ordering = true;
    const marker = document.createComment("");        // rebuild the post slots in the new order, leave everything else alone
    const frag = feed.children;
    const all = [...frag];
    const result = all.slice();
    slots.forEach((slot, i) => { result[slot] = sorted[i] ? sorted[i].n : all[slot]; });
    // only when every slot was filled by a ranked post
    if(sorted.length === slots.length) result.forEach(n => feed.appendChild(n));
    ordering = false;
  }
  watchSeen(feed); placeStrip(feed);
}
function schedule(force){ clearTimeout(ordT); ordT = setTimeout(() => applyOrder(!!force), 120); }

function watchSeen(feed){                  // remember what you actually looked at (≥1s, mostly on screen)
  if(!("IntersectionObserver" in window)) return;
  postNodes(feed).forEach(n => {
    if(n.__seen) return; n.__seen = true;
    let t = 0;
    new IntersectionObserver((es, io) => es.forEach(en => {
      if(en.intersectionRatio >= 0.5){ t = setTimeout(() => { const id = idOfNode(n); if(id){ SEEN[id] = Date.now(); const ks = Object.keys(SEEN); if(ks.length > 300){ ks.sort((a, b) => SEEN[a] - SEEN[b]).slice(0, ks.length - 300).forEach(k => delete SEEN[k]); } jset("cr_seen_v1", SEEN); } io.disconnect(); }, 1000); }
      else clearTimeout(t);
    }), { threshold: [0, 0.5] }).observe(n);
  });
}

/* tapping "For You" again = refresh the ranking */
(function(){
  const orig = window.switchFeedTab; if(typeof orig !== "function" || orig.__alg) return;
  const w = function(el){ const r = orig.apply(this, arguments); try{ schedule(true); }catch(e){} return r; };
  w.__alg = true; window.switchFeedTab = w;
  try{ switchFeedTab = w; }catch(e){}
})();
(function(){
  const f = feedEl(); if(!f) return;
  new MutationObserver(() => { if(!ordering) schedule(false); }).observe(f, { childList: true });
})();
document.addEventListener("visibilitychange", () => { if(!document.hidden && Date.now() - (window.__crHiddenAt || Date.now()) > 600000) schedule(true); else if(document.hidden) window.__crHiddenAt = Date.now(); });

/* ═════════ 2) PEOPLE YOU MAY KNOW ═════════ */
function pymkScore(c, m, ctx){
  const w = CFG.pymk, reasons = []; let s = 0;
  const mutual = (c.friends || []).filter(f => ctx.friends.has(f)).length + (ctx.fof.get(c.uid) || 0) * 0;
  if(mutual){ s += w.mutual * Math.min(mutual, w.mutualCap); reasons.push({ w: w.mutual * Math.min(mutual, w.mutualCap) + 3, t: mutual + (mutual === 1 ? " mutual friend" : " mutual friends") }); }
  const sameInst = c.inst && m.inst && norm(c.inst) === norm(m.inst);
  if(sameInst && c.dept && m.dept && norm(c.dept) === norm(m.dept)){ s += w.dept + w.inst; reasons.push({ w: w.dept + w.inst, t: "Same course · " + c.dept }); }
  else if(sameInst){
    s += w.inst;
    if(c.faculty && m.faculty && norm(c.faculty) === norm(m.faculty)){ s += w.faculty; reasons.push({ w: w.inst + w.faculty, t: "Same faculty · " + c.faculty }); }
    else reasons.push({ w: w.inst, t: "Same school · " + c.inst });
  }
  if(sameInst && c.level && m.level && String(c.level) === String(m.level)) s += w.level;
  if(c.state && m.state && norm(c.state) === norm(m.state)){
    s += w.state; reasons.push({ w: w.state + 0.5, t: "From " + c.state });
    if(c.lga && m.lga && norm(c.lga) === norm(m.lga)){ s += w.lga; reasons.push({ w: w.state + w.lga + 0.5, t: "Same LGA · " + c.lga }); }
  }
  if(c.role && m.role && c.role === m.role && (c.role === "Student" || c.role === "Alumni")) s += w.role;
  if(c.verified) s += w.verified;
  reasons.sort((a, b) => b.w - a.w);
  return { score: s, reasons: reasons.slice(0, 2).map(r => r.t) };
}
const PK_KEY = () => "cr_pymk_v1_" + ((me() || {}).uid || "");
const HIDE_KEY = () => "cr_pymk_hide_" + ((me() || {}).uid || "");
let PK = null, pkBusy = null;
async function computePymk(){
  const u = me(), d = dbx(); if(!u || !d) return [];
  const pool = new Map(), fr = friends();
  const add = s => s && s.forEach(x => { if(x.id !== u.uid) pool.set(x.id, Object.assign({ uid: x.id }, x.data())); });
  const qs = [];
  if(u.inst) qs.push(d.collection("users").where("inst", "==", u.inst).limit(60).get());
  if(u.dept) qs.push(d.collection("users").where("dept", "==", u.dept).limit(40).get());
  if(u.state) qs.push(d.collection("users").where("state", "==", u.state).limit(40).get());
  (await Promise.all(qs.map(q => q.catch(() => null)))).forEach(add);
  // friends of friends
  const fof = new Map();
  const mine = [...fr].slice(0, 20);
  if(mine.length){
    (await fetchProfiles(mine, true)).forEach(f => (f.friends || []).forEach(x => { if(x !== u.uid && !fr.has(x)) fof.set(x, (fof.get(x) || 0) + 1); }));
    const extra = [...fof.entries()].filter(([id]) => !pool.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(x => x[0]);
    if(extra.length) (await fetchProfiles(extra, true)).forEach(p => pool.set(p.uid, Object.assign({}, p)));
  }
  const hidden = new Set(jget(HIDE_KEY(), []));
  const ctx = { friends: fr, fof };
  const out = [];
  pool.forEach(c => {
    if(fr.has(c.uid) || hidden.has(c.uid) || !c.name) return;
    try{ if(typeof friendBtnState === "function"){ const st = friendBtnState(c.uid); if(st && (st.cls === "friends" || st.cls === "pending")) return; } }catch(e){}
    const r = pymkScore(c, u, ctx);
    const mutualBonus = (fof.get(c.uid) || 0);
    const score = r.score + (c.friends ? 0 : mutualBonus * CFG.pymk.mutual);
    if(score <= 0.6) return;
    const reasons = r.reasons.length ? r.reasons : (mutualBonus ? [mutualBonus + (mutualBonus === 1 ? " mutual friend" : " mutual friends")] : ["On CampusRoom"]);
    out.push({ uid: c.uid, score, reasons, name: c.name, username: c.username || "", photoURL: c.photoURL || "", role: c.role || "", inst: c.inst || "", dept: c.dept || "" });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, CFG.pymk.max);
}
async function getPymk(force){
  const u = me(); if(!u) return [];
  if(!force && PK) return PK;
  const c = jget(PK_KEY(), null);
  if(!force && c && Date.now() - c.t < 30 * 60000){ PK = c.list; return PK; }
  if(pkBusy) return pkBusy;
  pkBusy = computePymk().then(list => { PK = list; jset(PK_KEY(), { t: Date.now(), list }); pkBusy = null; return list; }).catch(() => { pkBusy = null; return PK || []; });
  return pkBusy;
}
function cardHTML(p){
  let st = { label: "➕ Add", cls: "" }; try{ if(typeof friendBtnState === "function") st = friendBtnState(p.uid) || st; }catch(e){}
  const av = p.photoURL ? '<img src="' + S(p.photoURL) + '" alt="">' : S(remo(p.role));
  return '<div class="pk-c" data-uid="' + S(p.uid) + '"><button type="button" class="pk-x" data-pk="hide" aria-label="Not interested">✕</button>' +
    '<div class="pk-av" data-pk="open">' + av + '</div><b class="pk-n" data-pk="open">' + S(p.name) + '</b><small>' + S(p.reasons[0] || "") + '</small>' +
    '<button type="button" class="pk-add ' + S(st.cls) + '" data-pk="add">' + S(st.cls === "friends" ? "✓ Friends" : st.label) + '</button></div>';
}
let PKCSS = false;
function pkCss(){
  if(PKCSS) return; PKCSS = true;
  const c = document.createElement("style");
  c.textContent = `
.cr-pymk{margin:6px 0 10px;padding:12px 0 6px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:rgba(var(--pr),.06);}
.pk-hd{display:flex;align-items:center;justify-content:space-between;padding:0 14px 8px;}
.pk-hd b{font-family:var(--fd);font-size:calc(14px * var(--fs,1));}
.pk-hd button{background:none;border:0;color:var(--plight);font-weight:800;font-size:calc(12px * var(--fs,1));cursor:pointer;}
.pk-row{display:flex;gap:10px;overflow-x:auto;padding:0 14px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;}
.pk-c{position:relative;flex:0 0 138px;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px 10px;border-radius:16px;border:1px solid var(--border);background:var(--bg,#0A0014);text-align:center;}
.pk-x{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;border:0;background:none;color:var(--muted);font-size:12px;cursor:pointer;}
.pk-av{width:58px;height:58px;border-radius:50%;overflow:hidden;background:rgba(var(--pr),.2);display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;}
.pk-av img{width:100%;height:100%;object-fit:cover;}
.pk-n{font-size:calc(13px * var(--fs,1));max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
.pk-c small{font-size:calc(10.5px * var(--fs,1));color:var(--muted);line-height:1.3;min-height:28px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.pk-add{margin-top:4px;width:100%;padding:7px 6px;border-radius:10px;border:1px solid var(--border);background:var(--p3,#7B00FF);color:#fff;font-family:var(--fd);font-weight:800;font-size:calc(12px * var(--fs,1));cursor:pointer;}
.pk-add.pending{background:transparent;color:var(--muted);}
.pk-add.friends{background:rgba(110,231,183,.14);color:#6EE7B7;border-color:rgba(110,231,183,.4);}
.pk-list .pk-c{flex:none;flex-direction:row;text-align:left;gap:12px;margin-bottom:8px;padding:10px 12px;}
.pk-list .pk-c small{min-height:0;}
.pk-list .pk-add{width:auto;margin:0;padding:8px 14px;}
.pk-list .pk-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.pk-ov{position:fixed;inset:0;z-index:9650;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;}
.pk-ov.open{display:flex;}
.pk-sheet{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:var(--bg,#0A0014);border:1px solid var(--border);border-bottom:0;border-radius:22px 22px 0 0;padding:16px 14px calc(20px + env(safe-area-inset-bottom,0px));color:var(--off);}
.pk-sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.pk-sh b{font-family:var(--fd);font-size:calc(17px * var(--fs,1));}
.pk-sh button{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:0;color:var(--muted);cursor:pointer;}
.pk-sec{margin:8px 12px 4px;font-size:calc(11px * var(--fs,1));font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);font-family:var(--fd);}
`;
  document.head.appendChild(c);
}
function actOn(el, list){
  const card = el.closest(".pk-c"); if(!card) return;
  const uid = card.dataset.uid, p = (list || PK || []).find(x => x.uid === uid); if(!p) return;
  const act = el.closest("[data-pk]").dataset.pk;
  if(act === "open"){ try{ if(typeof window.crOpenUser === "function") window.crOpenUser(uid, p); }catch(e){} return; }
  if(act === "hide"){ const h = jget(HIDE_KEY(), []); h.push(uid); jset(HIDE_KEY(), h.slice(-200)); PK = (PK || []).filter(x => x.uid !== uid); jset(PK_KEY(), { t: Date.now(), list: PK }); document.querySelectorAll('.pk-c[data-uid="' + uid + '"]').forEach(n => n.remove()); return; }
  if(act === "add"){
    const btn = el.closest("[data-pk]"); btn.disabled = true;
    Promise.resolve(window.handleFriendBtn && window.handleFriendBtn(uid, p.name, p.role, p.photoURL)).catch(() => {}).then(() => {
      try{ const st = friendBtnState(uid); btn.textContent = st.cls === "friends" ? "✓ Friends" : st.label; btn.className = "pk-add " + st.cls; }catch(e){}
      btn.disabled = false;
    });
  }
}
function stripNode(list){
  const n = document.createElement("div"); n.className = "cr-pymk"; n.setAttribute("data-noswipe", "1");
  n.innerHTML = '<div class="pk-hd"><b>People you may know</b><button type="button" data-pk-all="1">See all</button></div><div class="pk-row">' + list.slice(0, 8).map(cardHTML).join("") + '</div>';
  n.addEventListener("click", e => { if(e.target.closest("[data-pk-all]")){ openAll(); return; } if(e.target.closest("[data-pk]")) actOn(e.target, list); });
  return n;
}
function placeStrip(feed){
  const old = feed.querySelector(".cr-pymk");
  if(!PK || !PK.length){ if(old) old.remove(); return; }
  if(old) return;
  pkCss();
  const posts = postNodes(feed); if(posts.length < 2) return;
  const after = posts[Math.min(2, posts.length - 1)];
  feed.insertBefore(stripNode(PK), after.nextSibling);
}
function openAll(){
  pkCss();
  let ov = $("pk-ov");
  if(!ov){ ov = document.createElement("div"); ov.className = "pk-ov"; ov.id = "pk-ov"; ov.innerHTML = '<div class="pk-sheet"><div class="pk-sh"><b>People you may know</b><button type="button" data-x="1" aria-label="Close">✕</button></div><div class="pk-list" id="pk-all"></div></div>'; document.body.appendChild(ov);
    ov.addEventListener("click", e => { if(e.target === ov || e.target.closest("[data-x]")){ ov.classList.remove("open"); return; } if(e.target.closest("[data-pk]")) actOn(e.target, PK); }); }
  const box = $("pk-all");
  box.innerHTML = (PK || []).map(p => cardHTML(p).replace('<div class="pk-av"', '<div class="pk-av"').replace(/(<b class="pk-n"[^>]*>.*?<\/b><small>.*?<\/small>)/, '<div class="pk-body">$1</div>')).join("") || '<div style="text-align:center;color:var(--muted);padding:24px">No suggestions yet — add your school and course to your profile.</div>';
  ov.classList.add("open");
}
/* the same list inside Messages › Friends */
(function(){
  const orig = window.renderFriendsTab; if(typeof orig !== "function" || orig.__alg) return;
  const w = async function(){
    const r = await orig.apply(this, arguments);
    try{
      const list = $("clist"), f = (typeof chatFilter !== "undefined") ? chatFilter : "";
      if(list && f === "Friends"){
        const pk = await getPymk();
        if(pk && pk.length && !list.querySelector(".pk-sugg")){
          pkCss();
          const sec = document.createElement("div"); sec.className = "pk-sugg";
          sec.innerHTML = '<div class="pk-sec">People you may know</div><div class="pk-list" style="padding:4px 12px">' + pk.slice(0, 6).map(p => cardHTML(p).replace(/(<b class="pk-n"[^>]*>.*?<\/b><small>.*?<\/small>)/, '<div class="pk-body">$1</div>')).join("") + '</div>';
          sec.addEventListener("click", e => { if(e.target.closest("[data-pk]")) actOn(e.target, pk); });
          list.appendChild(sec);
        }
      }
    }catch(e){}
    return r;
  };
  w.__alg = true; window.renderFriendsTab = w;
})();

/* ───────── start up ───────── */
async function init(){
  const u = me(); if(!u || !u.uid) return;
  affLoad(); await loadRemoteCfg();
  try{ await getPymk(); }catch(e){}
  schedule(true);
}
if(typeof window.startApp === "function" && !window.startApp.__alg){
  const _s = window.startApp;
  const w = function(){ const r = _s.apply(this, arguments); setTimeout(init, 1200); return r; };
  w.__alg = true; window.startApp = w;
}
if(typeof window.doLogout === "function" && !window.doLogout.__alg){
  const _l = window.doLogout;
  const w = function(){ AFF = null; PK = null; MEMO = new Map(); PROF.clear(); return _l.apply(this, arguments); };
  w.__alg = true; window.doLogout = w;
}
if(me() && me().uid) setTimeout(init, 1200);

/* ───────── for tuning / debugging ───────── */
window.crRank = {
  cfg: CFG, scorePost, pymkScore, schoolMatch, affScore, bump,
  why(id){
    const p = cache().get(id), u = me(); if(!p || !u) return "post not loaded";
    const r = scorePost(p, { me: u, friends: friends(), prof: PROF, now: Date.now(), seen: SEEN });
    const out = { score: +r.score.toFixed(3), ageHours: +r.ageH.toFixed(1) };
    Object.keys(r.parts).forEach(k => { out[k] = +r.parts[k].toFixed(3) + "  (× " + CFG.feed.w[k] + ")"; });
    console.table(out); return out;
  },
  refresh(){ schedule(true); }
};
})();
