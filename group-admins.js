/* CampusRoom — members vote for the admins of each AUTO group
 *
 *  • Any member can run for admin (one line about why) and every member gets ONE vote (it can be moved).
 *  • Whoever reaches the "bar" becomes an admin automatically, up to 5 per group:
 *        bar = 3 votes  (groups of up to 30 members)   or   10% of the members  (bigger groups)
 *  • An admin whose votes fall to less than half the bar (or who withdraws) is removed.
 *  • Lecturers are still admins of auto groups (existing rule). App admins can also appoint / remove people.
 *  • What elected admins can do is whatever the group-info screen already gives admins
 *    (edit the group, "only admins can send messages", …).
 *
 * Needs the Firestore rules in firestore-rules-group-admins.txt.
 * Loaded with <script src="group-admins.js" defer></script> in index.html.
 */
(function(){
"use strict";

const $ = id => document.getElementById(id);
const S = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = m => { try{ if(typeof window.showToast === "function") window.showToast(m); }catch(e){} };
const me = () => { try{ return typeof CU !== "undefined" ? CU : null; }catch(e){ return null; } };
const dbx = () => { try{ return typeof db !== "undefined" ? db : null; }catch(e){ return null; } };
const FV = () => firebase.firestore.FieldValue;
const remo = r => { try{ return (typeof REMO !== "undefined" && REMO[r]) || "👤"; }catch(e){ return "👤"; } };

const MAX_ADMINS = 5;
const bar = n => n > 30 ? Math.ceil(n * 0.1) : 3;               // keep in step with the Firestore rules

/* ───────── the "bar" logic, written so it can be tested on its own ───────── */
async function syncAdminsWith(d, gid){
  const gref = d.collection("groups").doc(gid);
  for(let i = 0; i < 8; i++){
    const gs = await gref.get(); if(!gs.exists) return "gone";
    const g = gs.data(), T = bar((g.members || []).length), admins = (g.admins || []).slice(), appointed = g.appointed || [];
    const cs = await gref.collection("candidates").orderBy("votes", "desc").limit(50).get();
    const votes = new Map(); cs.forEach(x => votes.set(x.id, x.data().votes || 0));
    for(const a of admins){ if(!votes.has(a) && !appointed.includes(a)){ const c = await gref.collection("candidates").doc(a).get(); if(c.exists) votes.set(a, c.data().votes || 0); } }
    // 1) someone elected who fell below half the bar (or withdrew) steps down — one at a time, the rules check each step
    const out = admins.find(a => !appointed.includes(a) && (!votes.has(a) || votes.get(a) * 2 < T));
    if(out){ try{ await gref.update({ admins: admins.filter(a => a !== out) }); }catch(e){ return "blocked"; } continue; }
    // 2) the best candidate who reached the bar joins
    if(admins.length < MAX_ADMINS){
      const add = [...votes.entries()].filter(([id, v]) => v >= T && !admins.includes(id)).sort((a, b) => b[1] - a[1])[0];
      if(add){ try{ await gref.update({ admins: admins.concat(add[0]) }); }catch(e){ return "blocked"; } continue; }
    }
    return "ok";
  }
  return "ok";
}
window.crGroupAdmins = { bar, syncAdminsWith, MAX_ADMINS };

/* ───────── styles ───────── */
const css = document.createElement("style");
css.textContent = `
.ge-ov{position:fixed;inset:0;z-index:9650;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;}
.ge-ov.open{display:flex;}
.ge-sheet{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;background:var(--bg,#0A0014);border:1px solid var(--border);border-bottom:0;border-radius:22px 22px 0 0;padding:16px 16px calc(22px + env(safe-area-inset-bottom,0px));color:var(--off);}
.ge-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.ge-hd b{font-family:var(--fd);font-size:calc(17px * var(--fs,1));}
.ge-x{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:0;color:var(--muted);cursor:pointer;}
.ge-sub{font-size:calc(12px * var(--fs,1));color:var(--muted);line-height:1.55;margin-bottom:10px;}
.ge-lbl{font-size:calc(11px * var(--fs,1));font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:var(--muted);margin:14px 0 8px;font-family:var(--fd);}
.ge-chips{display:flex;flex-wrap:wrap;gap:8px;}
.ge-chip{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(var(--pr),.16);font-size:calc(12px * var(--fs,1));font-weight:700;}
.ge-chip button{background:none;border:0;color:var(--muted);cursor:pointer;padding:0 0 0 2px;}
.ge-run{display:flex;gap:8px;margin:6px 0 4px;}
.ge-run input{flex:1;min-width:0;padding:11px;border-radius:12px;border:1px solid var(--border);background:rgba(var(--pr),.1);color:var(--off);font-size:calc(13px * var(--fs,1));}
.ge-btn{padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(var(--pr),.14);color:var(--off);font-family:var(--fd);font-weight:800;font-size:calc(12px * var(--fs,1));cursor:pointer;white-space:nowrap;}
.ge-btn.pri{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.ge-btn.on{background:rgba(110,231,183,.15);border-color:rgba(110,231,183,.45);color:#6EE7B7;}
.ge-btn:disabled{opacity:.5;}
.ge-c{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
.ge-c:last-child{border-bottom:0;}
.ge-av{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(var(--pr),.2);display:flex;align-items:center;justify-content:center;font-size:20px;}
.ge-av img{width:100%;height:100%;object-fit:cover;}
.ge-tx{flex:1;min-width:0;}
.ge-tx b{display:block;font-size:calc(13px * var(--fs,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ge-tx small{display:block;font-size:calc(11px * var(--fs,1));color:var(--muted);line-height:1.4;margin-top:2px;}
.ge-prog{height:5px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden;}
.ge-prog i{display:block;height:100%;background:var(--plight,#b98cff);border-radius:3px;}
.ge-prog.done i{background:#6EE7B7;}
.ge-empty{text-align:center;color:var(--muted);font-size:calc(13px * var(--fs,1));padding:18px 6px;line-height:1.6;}
.ge-card .ge-go{margin-top:10px;}
`;
document.head.appendChild(css);

/* ───────── which group is open ───────── */
let GID = "", G = null, CANDS = [], MYB = "", APP_ADMIN = false, NAMES = new Map(), unsubs = [], OPEN = false, RUN = false, BUSY = false;

window.addEventListener("cr-group-info", e => { GID = (e.detail || {}).id || window.crGiId || ""; G = null; prepare(); });

async function prepare(){
  const d = dbx(); if(!d || !GID) return;
  try{ const s = await d.collection("groups").doc(GID).get(); G = s.exists ? Object.assign({ id: GID }, s.data()) : null; }catch(e){ G = null; }
  attach(0); inject();
}
function attach(n){
  const b = $("gi-body");
  if(!b){ if(n < 40) setTimeout(() => attach(n + 1), 100); return; }
  if(b.__ge) return; b.__ge = true;
  new MutationObserver(() => inject()).observe(b, { childList: true });
}
function inject(){
  const b = $("gi-body"), u = me();
  if(!b || !G || !u || G.type !== "auto" || b.querySelector("#ge-card")) return;
  if(!(G.members || []).includes(u.uid)) return;                       // members only
  const sec = document.createElement("div"); sec.className = "cs-sec"; sec.textContent = "ADMINS";
  const card = document.createElement("div"); card.className = "gi-card ge-card"; card.id = "ge-card";
  const n = (G.admins || []).length, T = bar((G.members || []).length);
  card.innerHTML = '<div class="gi-v">🗳 <b>Members vote for their admins.</b><br><span class="gi-ms">' + (n ? n + " elected admin" + (n === 1 ? "" : "s") + " · " : "") + 'A candidate needs ' + T + ' votes. Run for admin, or vote for someone you trust.</span></div>' +
    '<button type="button" class="btn btn-g btn-w ge-go" data-ge="1">🗳 Vote &amp; run for admin</button>';
  card.addEventListener("click", e => { if(e.target.closest("[data-ge]")) openSheet(); });
  const mem = [...b.querySelectorAll(".cs-sec")].find(x => /^MEMBERS/.test((x.textContent || "").trim()));
  if(mem){ b.insertBefore(sec, mem); b.insertBefore(card, mem); } else { b.appendChild(sec); b.appendChild(card); }
}

/* ───────── the sheet ───────── */
function ensureSheet(){
  if($("ge-ov")) return;
  const o = document.createElement("div"); o.className = "ge-ov"; o.id = "ge-ov";
  o.innerHTML = '<div class="ge-sheet" id="ge-sheet"></div>';
  document.body.appendChild(o);
  o.addEventListener("click", onClick);
}
function stopAll(){ unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs = []; }
async function openSheet(){
  const d = dbx(), u = me(); if(!d || !u || !GID) return;
  ensureSheet(); OPEN = true; RUN = false; CANDS = []; MYB = ""; stopAll();
  $("ge-ov").classList.add("open"); paint();
  const gref = d.collection("groups").doc(GID);
  d.collection("admins").doc(u.uid).get().then(s => { APP_ADMIN = s.exists; paint(); }).catch(() => {});
  unsubs.push(gref.onSnapshot(s => { if(s.exists){ G = Object.assign({ id: GID }, s.data()); loadNames(); paint(); } }, () => {}));
  unsubs.push(gref.collection("candidates").orderBy("votes", "desc").limit(50).onSnapshot(s => { CANDS = s.docs.map(x => Object.assign({ id: x.id }, x.data())); paint(); }, err => { console.log("candidates:", err && err.code); paint(); }));
  unsubs.push(gref.collection("ballots").doc(u.uid).onSnapshot(s => { MYB = s.exists ? (s.data().candidate || "") : ""; paint(); }, () => {}));
  syncAdminsWith(d, GID).catch(() => {});
}
function closeSheet(){ OPEN = false; stopAll(); const o = $("ge-ov"); if(o) o.classList.remove("open"); }
async function loadNames(){
  const d = dbx(), need = (G.admins || []).filter(a => !NAMES.has(a)); if(!d || !need.length) return;
  try{
    const s = await d.collection("users").where(firebase.firestore.FieldPath.documentId(), "in", need.slice(0, 10)).get();
    s.forEach(x => NAMES.set(x.id, x.data().name || "Member")); paint();
  }catch(e){}
}
function paint(){
  const box = $("ge-sheet"); if(!box || !OPEN || !G) return;
  const u = me() || {}, T = bar((G.members || []).length), admins = G.admins || [], appointed = G.appointed || [];
  const iRun = CANDS.some(c => c.id === u.uid);
  box.innerHTML =
    '<div class="ge-hd"><b>🗳 Admin election</b><button type="button" class="ge-x" data-x="1" aria-label="Close">✕</button></div>' +
    '<div class="ge-sub">Members of <b>' + S(G.name || "this group") + '</b> vote for their admins. Anyone who reaches <b>' + T + ' votes</b> becomes an admin (up to ' + MAX_ADMINS + '). Each member has one vote and can move it any time.' + (G.type === "auto" ? " Lecturers in this group are admins too." : "") + '</div>' +
    '<div class="ge-lbl">Admins now</div>' +
    (admins.length ? '<div class="ge-chips">' + admins.map(a => '<span class="ge-chip">👑 ' + S(NAMES.get(a) || "Member") + (APP_ADMIN ? ' <button type="button" data-rm="' + S(a) + '" aria-label="Remove">✕</button>' : '') + (appointed.includes(a) ? ' <small>· appointed</small>' : '') + '</span>').join("") + '</div>' : '<div class="ge-empty" style="padding:6px 0;text-align:left">No elected admins yet.</div>') +
    '<div class="ge-lbl">Candidates</div>' +
    (iRun ? '<button type="button" class="ge-btn" data-act="withdraw">↩ Withdraw my candidacy</button>'
          : RUN ? '<div class="ge-run"><input type="text" id="ge-stmt" maxlength="140" placeholder="Why should members pick you? (optional)"><button type="button" class="ge-btn pri" data-act="run" ' + (BUSY ? "disabled" : "") + '>Run</button></div>'
          : '<button type="button" class="ge-btn pri" data-act="start">🙋 Run for admin</button>') +
    (CANDS.length ? CANDS.map(c => {
        const v = c.votes || 0, pct = Math.min(100, Math.round(v / T * 100)), mine = MYB === c.id;
        return '<div class="ge-c"><div class="ge-av">' + (c.photoURL ? '<img src="' + S(c.photoURL) + '" alt="">' : S(remo(""))) + '</div><div class="ge-tx"><b>' + S(c.name || "Member") + (c.id === u.uid ? " (you)" : "") + '</b><small>' + S(c.statement || "") + '</small><div class="ge-prog ' + (v >= T ? "done" : "") + '"><i style="width:' + pct + '%"></i></div><small>' + v + ' / ' + T + ' votes' + (admins.includes(c.id) ? ' · 👑 admin' : '') + '</small></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px"><button type="button" class="ge-btn ' + (mine ? "on" : "pri") + '" data-vote="' + S(c.id) + '"' + (mine || BUSY ? " disabled" : "") + '>' + (mine ? "✓ Your vote" : MYB ? "Move my vote" : "Vote") + '</button>' +
          (APP_ADMIN && !admins.includes(c.id) ? '<button type="button" class="ge-btn" data-appoint="' + S(c.id) + '">Appoint</button>' : '') + '</div></div>';
      }).join("") : '<div class="ge-empty">Nobody is running yet.<br>Be the first — tap <b>Run for admin</b>.</div>');
}
async function onClick(e){
  const d = dbx(), u = me(); if(!d || !u) return;
  if(e.target === $("ge-ov") || e.target.closest("[data-x]")){ closeSheet(); return; }
  const gref = d.collection("groups").doc(GID);
  const act = e.target.closest("[data-act]"), vote = e.target.closest("[data-vote]"), appoint = e.target.closest("[data-appoint]"), rm = e.target.closest("[data-rm]");
  try{
    if(act && act.dataset.act === "start"){ RUN = true; paint(); const i = $("ge-stmt"); if(i) i.focus(); return; }
    if(act && act.dataset.act === "run"){
      BUSY = true; paint();
      const stmt = (($("ge-stmt") || {}).value || "").trim().slice(0, 140);
      await gref.collection("candidates").doc(u.uid).set({ uid: u.uid, name: u.name || "", photoURL: u.photoURL || "", statement: stmt, votes: 0, createdAt: FV().serverTimestamp() });
      RUN = false; toast("🙋 You’re running for admin");
    }
    else if(act && act.dataset.act === "withdraw"){
      if(!confirm("Withdraw from the election?")) return;
      await gref.collection("candidates").doc(u.uid).delete(); toast("Withdrawn"); await syncAdminsWith(d, GID);
    }
    else if(vote){
      BUSY = true; paint(); await castVote(d, gref, u.uid, vote.dataset.vote); toast("🗳 Vote counted"); await syncAdminsWith(d, GID);
    }
    else if(appoint){
      await gref.update({ admins: FV().arrayUnion(appoint.dataset.appoint), appointed: FV().arrayUnion(appoint.dataset.appoint) }); toast("👑 Appointed");
    }
    else if(rm){
      if(!confirm("Remove this admin?")) return;
      await gref.update({ admins: FV().arrayRemove(rm.dataset.rm), appointed: FV().arrayRemove(rm.dataset.rm) }); toast("Admin removed");
    }
  }catch(err){
    console.log("election action:", err);
    toast(err && err.code === "permission-denied" ? "Not allowed — the election rules may not be added yet." : "Something went wrong. Try again.");
  }finally{ BUSY = false; paint(); }
}
async function castVote(d, gref, uid, cid){
  const bref = gref.collection("ballots").doc(uid), prev = await bref.get(), old = prev.exists ? (prev.data().candidate || "") : "";
  if(old === cid) return;
  const batch = d.batch();
  batch.set(bref, { voter: uid, candidate: cid, at: FV().serverTimestamp() });
  batch.update(gref.collection("candidates").doc(cid), { votes: FV().increment(1) });
  if(old){ const os = await gref.collection("candidates").doc(old).get(); if(os.exists) batch.update(gref.collection("candidates").doc(old), { votes: FV().increment(-1) }); }
  await batch.commit();
}
})();
