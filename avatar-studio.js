/* CampusRoom — Avatar Studio
 *  1. Gallery        — pictures listed in avatars.json (or avatars/index.json)
 *  2. From my photo  — turns a selfie into a 3D cartoon (needs api/cartoonize.js on Vercel)
 *  3. Cartoon styles — flat cartoon faces from DiceBear, with skin-tone and background choices
 * Loaded with <script src="avatar-studio.js" defer></script> in index.html.
 */
(function(){
"use strict";

/* ───────── settings ───────── */
const MAX_AI_TRIES = 4;                                   // per visit; the server also limits each person
const AI_URL = (function(){
  if(window.CR_AVATAR_ENDPOINT) return window.CR_AVATAR_ENDPOINT;
  const e = window.CR_AI_ENDPOINT;                        // …/api/ai  →  …/api/cartoonize
  if(e) return String(e).replace(/\/[^\/]*\/?$/, "/cartoonize");
  return "/api/cartoonize";
})();
const DICE = [
  { id: "adventurer", name: "Adventurer", skin: ["skinColor", ["f2d3b1", "ecad80", "d08b5b", "9e5622", "763900"]] },
  { id: "open-peeps", name: "Open Peeps", skin: ["skinColor", ["ffdbb4", "edb98a", "d08b5b", "ae5d29", "694d3d"]] },
  { id: "personas",   name: "Personas",   skin: ["skinColor", ["e5a38b", "d78774", "b16a5b", "92594b", "623d36"]] },
  { id: "big-smile",  name: "Big Smile",  skin: ["skinColor", ["ffdbac", "f1c27d", "e0ac69", "c68642", "8d5524"]] },
  { id: "micah",      name: "Micah",      skin: ["baseColor", ["f9c9b6", "ac6651", "77311d"]] }
];
const BGS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c1f0d6", "ffffff"];

/* ───────── helpers ───────── */
const $ = id => document.getElementById(id);
const S = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = m => { try{ if(typeof window.showToast === "function") window.showToast(m); }catch(e){} };
const me = () => { try{ return typeof CU !== "undefined" ? CU : null; }catch(e){ return null; } };
const seed = () => Math.random().toString(36).slice(2, 10);

const ST = { tab: "gallery", pick: null, gallery: null, tag: "All", saving: false,
             ai: { photo: null, thumb: "", result: "", busy: false, tries: 0, msg: "" },
             dc: { i: 0, seed: seed(), skin: 2, bg: 0 } };

/* ───────── styles (injected once) ───────── */
const css = document.createElement("style");
css.textContent = `
.as-ov{position:fixed;inset:0;z-index:9650;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;}
.as-ov.open{display:flex;}
.as-sheet{width:100%;max-width:520px;height:92vh;display:flex;flex-direction:column;background:var(--bg,#0A0014);border:1px solid var(--border);border-bottom:0;border-radius:22px 22px 0 0;color:var(--off);}
.as-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 4px;}
.as-hd b{font-family:var(--fd);font-size:calc(17px * var(--fs,1));}
.as-x{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:0;color:var(--muted);font-size:calc(15px * var(--fs,1));cursor:pointer;}
.as-prev{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0 8px;}
.as-circle{width:112px;height:112px;border-radius:50%;overflow:hidden;border:3px solid rgba(var(--pr),.55);background:rgba(var(--pr),.15);display:flex;align-items:center;justify-content:center;font-size:44px;}
.as-circle img{width:100%;height:100%;object-fit:cover;}
.as-cap{font-size:calc(11px * var(--fs,1));color:var(--muted);}
.as-tabs{display:flex;gap:8px;padding:0 14px 8px;overflow-x:auto;}
.as-tabs button{flex-shrink:0;padding:9px 14px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:var(--fd);font-weight:700;font-size:calc(13px * var(--fs,1));cursor:pointer;}
.as-tabs button.on{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.as-body{flex:1;overflow-y:auto;padding:4px 14px 12px;}
.as-note{font-size:calc(12px * var(--fs,1));color:var(--muted);line-height:1.55;margin:4px 0 10px;}
.as-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.as-chips button{padding:7px 13px;border-radius:999px;border:1px solid var(--border);background:rgba(var(--pr),.1);color:var(--off);font-size:calc(12px * var(--fs,1));font-weight:700;cursor:pointer;}
.as-chips button.on{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.as-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.as-g{aspect-ratio:1;border-radius:16px;overflow:hidden;border:2px solid transparent;background:rgba(var(--pr),.12);padding:0;cursor:pointer;}
.as-g.on{border-color:var(--plight);}
.as-g img{width:100%;height:100%;object-fit:cover;display:block;}
.as-empty{text-align:center;color:var(--muted);font-size:calc(13px * var(--fs,1));line-height:1.6;padding:26px 8px;}
.as-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:rgba(var(--pr),.14);color:var(--off);font-family:var(--fd);font-weight:800;font-size:calc(13px * var(--fs,1));cursor:pointer;}
.as-btn.pri{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.as-btn:disabled{opacity:.5;}
.as-row{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 10px;}
.as-row .as-btn{flex:1;min-width:130px;}
.as-pair{display:flex;gap:12px;justify-content:center;margin:12px 0;}
.as-pair div{width:42%;max-width:170px;aspect-ratio:1;border-radius:18px;overflow:hidden;background:rgba(var(--pr),.12);display:flex;align-items:center;justify-content:center;font-size:calc(11px * var(--fs,1));color:var(--muted);text-align:center;}
.as-pair img{width:100%;height:100%;object-fit:cover;}
.as-msg{font-size:calc(12px * var(--fs,1));text-align:center;margin:6px 0;color:var(--muted);min-height:16px;}
.as-msg.bad{color:var(--rlight,#ff6b81);}
.as-sw{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 12px;}
.as-sw button{width:36px;height:36px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0;box-shadow:0 0 0 1px rgba(255,255,255,.18) inset;}
.as-sw button.on{border-color:var(--plight);}
.as-lbl{font-size:calc(11px * var(--fs,1));font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);margin:10px 0 6px;font-family:var(--fd);}
.as-foot{padding:10px 14px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border);}
.as-save{width:100%;padding:14px;border-radius:14px;border:0;background:var(--p3,#7B00FF);color:#fff;font-family:var(--fd);font-weight:800;font-size:calc(15px * var(--fs,1));cursor:pointer;}
.as-save:disabled{opacity:.45;}
.as-classic{display:block;margin:10px auto 0;background:none;border:0;color:var(--muted);font-size:calc(12px * var(--fs,1));text-decoration:underline;cursor:pointer;}
`;
document.head.appendChild(css);

/* ───────── preview + selection ───────── */
function showCircle(src, fallback){
  const c = $("as-circle"); if(!c) return;
  if(!src){ c.textContent = "👤"; return; }
  const img = new Image(); img.alt = "";
  img.onerror = () => { if(fallback && img.src !== fallback){ img.src = fallback; } };
  img.src = src; c.innerHTML = ""; c.appendChild(img);
}
function setPick(p){
  ST.pick = p;
  showCircle(p && p.preview, p && p.fallback);
  const cap = $("as-cap"); if(cap) cap.textContent = p ? p.label : "Pick one below";
  const sv = $("as-save"); if(sv) sv.disabled = !p || ST.saving;
}

/* ───────── gallery ───────── */
async function loadGallery(){
  if(ST.gallery) return ST.gallery;
  // works whether the pictures sit next to index.html (avatars.json) or inside an avatars/ folder (avatars/index.json)
  const spots = [{ json: "avatars.json", dir: "" }, { json: "avatars/index.json", dir: "avatars/" }];
  ST.gallery = [];
  for(const sp of spots){
    try{
      const r = await fetch(sp.json, { cache: "no-cache" }); if(!r.ok) continue;
      const j = await r.json();
      const list = (Array.isArray(j) ? j : j.avatars || []).filter(x => x && x.file).map(x => ({
        file: x.file, name: x.name || "Avatar", tags: Array.isArray(x.tags) ? x.tags : [],
        url: new URL(sp.dir + x.file, document.baseURI).href
      }));
      if(list.length){ ST.gallery = list; break; }
    }catch(e){}
  }
  return ST.gallery;
}
async function tabGallery(body){
  body.innerHTML = '<div class="as-empty">Loading…</div>';
  const list = await loadGallery();
  if(ST.tab !== "gallery") return;
  if(!list.length){
    body.innerHTML = '<div class="as-empty">No gallery avatars yet.<br>List your pictures in <b>avatars.json</b>.</div>';
    return;
  }
  const tags = ["All", ...new Set(list.flatMap(x => x.tags))];
  const shown = list.filter(x => ST.tag === "All" || x.tags.includes(ST.tag));
  body.innerHTML = (tags.length > 2 ? '<div class="as-chips">' + tags.map(t => '<button type="button" data-tag="' + S(t) + '" class="' + (t === ST.tag ? "on" : "") + '">' + S(t) + '</button>').join("") + '</div>' : "") +
    '<div class="as-grid">' + shown.map(x => '<button type="button" class="as-g' + (ST.pick && ST.pick.key === x.url ? " on" : "") + '" data-g="' + S(x.url) + '" aria-label="' + S(x.name) + '"><img loading="lazy" src="' + S(x.url) + '" alt=""></button>').join("") + '</div>';
  body.onclick = e => {
    const t = e.target.closest("[data-tag]"); if(t){ ST.tag = t.dataset.tag; tabGallery(body); return; }
    const g = e.target.closest("[data-g]"); if(!g) return;
    const it = list.find(x => x.url === g.dataset.g); if(!it) return;
    body.querySelectorAll(".as-g").forEach(b => b.classList.toggle("on", b === g));
    setPick({ key: it.url, label: it.name, preview: it.url, blob: () => fetch(it.url).then(r => { if(!r.ok) throw new Error("Couldn’t load that avatar"); return r.blob(); }) });
  };
}

/* ───────── from my photo (AI) ───────── */
function photoToDataURL(file, max, q){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", q));
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("bad")); };
    im.src = u;
  });
}
const dataUrlToBlob = d => fetch(d).then(r => r.blob());

function tabPhoto(body){
  const a = ST.ai;
  body.innerHTML =
    '<div class="as-note">Take a selfie or choose a photo and we’ll turn it into a 3D cartoon of you. Use a clear photo of <b>your own face</b>. The photo is sent to an AI service to make the cartoon; CampusRoom doesn’t keep it.</div>' +
    '<div class="as-row"><button type="button" class="as-btn" id="as-selfie">📸 Take selfie</button><button type="button" class="as-btn" id="as-choose">🖼 Choose photo</button></div>' +
    '<input type="file" id="as-f1" accept="image/*" capture="user" hidden><input type="file" id="as-f2" accept="image/*" hidden>' +
    '<div class="as-pair"><div>' + (a.thumb ? '<img src="' + S(a.thumb) + '" alt="">' : "Your photo") + '</div><div id="as-res">' + (a.result ? '<img src="' + S(a.result) + '" alt="">' : "Your cartoon") + '</div></div>' +
    '<div class="as-msg' + (a.msgBad ? " bad" : "") + '" id="as-msg">' + S(a.msg || "") + '</div>' +
    '<div class="as-row"><button type="button" class="as-btn pri" id="as-make"' + (!a.photo || a.busy ? " disabled" : "") + '>' + (a.busy ? "⏳ Making your avatar…" : (a.result ? "🔄 Try again" : "✨ Make my avatar")) + '</button></div>';
  const take = f => {
    if(!f) return;
    photoToDataURL(f, 768, .85).then(d => { a.photo = d; a.thumb = d; a.result = ""; a.msg = ""; a.msgBad = false; setPick(null); tabPhoto(body); })
      .catch(() => { a.msg = "Couldn’t read that photo. Try another one."; a.msgBad = true; tabPhoto(body); });
  };
  $("as-selfie").onclick = () => $("as-f1").click();
  $("as-choose").onclick = () => $("as-f2").click();
  $("as-f1").onchange = e => take(e.target.files[0]);
  $("as-f2").onchange = e => take(e.target.files[0]);
  $("as-make").onclick = () => makeAI(body);
}
async function makeAI(body){
  const a = ST.ai; if(a.busy || !a.photo) return;
  if(navigator.onLine === false){ a.msg = "You’re offline. Connect to the internet and try again."; a.msgBad = true; tabPhoto(body); return; }
  if(a.tries >= MAX_AI_TRIES){ a.msg = "That’s enough tries for now. Pick one of the other avatars, or come back later."; a.msgBad = true; tabPhoto(body); return; }
  a.busy = true; a.msg = "This takes about 20 seconds…"; a.msgBad = false; tabPhoto(body);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 90000);
  try{
    const u = typeof auth !== "undefined" && auth && auth.currentUser; if(!u) throw { friendly: "Please sign in again." };
    const token = await u.getIdToken();
    a.tries++;
    const r = await fetch(AI_URL, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ image: a.photo }) });
    const j = await r.json().catch(() => ({}));
    if(r.status === 404) throw { friendly: "The cartoon maker isn’t set up on this website yet." };
    if(!r.ok || !j.image) throw { friendly: j.error || "Couldn’t make your avatar. Try again." };
    a.result = j.image; a.msg = "Looks good? Tap “Use this avatar”."; a.msgBad = false;
    const blob = await dataUrlToBlob(j.image);
    setPick({ key: "ai", label: "Your 3D cartoon", preview: j.image, blob: () => Promise.resolve(blob) });
  }catch(e){
    a.msg = e && e.name === "AbortError" ? "That took too long. Try again." : (e && e.friendly) || "Couldn’t reach the cartoon maker. Check your connection.";
    a.msgBad = true;
  }finally{ clearTimeout(timer); a.busy = false; if(ST.tab === "photo") tabPhoto(body); }
}

/* ───────── cartoon styles (DiceBear) ───────── */
function diceUrl(fmt, withSkin){
  const d = ST.dc, st = DICE[d.i];
  let u = "https://api.dicebear.com/9.x/" + st.id + "/" + fmt + "?seed=" + encodeURIComponent(d.seed) + "&backgroundColor=" + BGS[d.bg];
  if(withSkin && st.skin && st.skin[1][d.skin] != null) u += "&" + st.skin[0] + "=" + st.skin[1][d.skin];
  return u + (fmt === "png" ? "&size=512" : "");
}
function pickDice(){
  const st = DICE[ST.dc.i];
  setPick({
    key: "dice", label: st.name + " style", preview: diceUrl("svg", true), fallback: diceUrl("svg", false),
    blob: async () => {
      let r = await fetch(diceUrl("png", true)).catch(() => null);
      if(!r || !r.ok) r = await fetch(diceUrl("png", false));
      if(!r.ok) throw new Error("Couldn’t load that style");
      return r.blob();
    }
  });
}
function tabStyles(body){
  const d = ST.dc, st = DICE[d.i];
  if(d.skin >= st.skin[1].length) d.skin = Math.floor(st.skin[1].length / 2);
  body.innerHTML =
    '<div class="as-chips">' + DICE.map((x, i) => '<button type="button" data-st="' + i + '" class="' + (i === d.i ? "on" : "") + '">' + S(x.name) + '</button>').join("") + '</div>' +
    '<div class="as-row"><button type="button" class="as-btn" id="as-shuf">🎲 Shuffle face</button></div>' +
    '<div class="as-lbl">Skin tone</div><div class="as-sw">' + st.skin[1].map((c, i) => '<button type="button" data-sk="' + i + '" class="' + (i === d.skin ? "on" : "") + '" style="background:#' + c + '" aria-label="Skin tone ' + (i + 1) + '"></button>').join("") + '</div>' +
    '<div class="as-lbl">Background</div><div class="as-sw">' + BGS.map((c, i) => '<button type="button" data-bg="' + i + '" class="' + (i === d.bg ? "on" : "") + '" style="background:#' + c + '" aria-label="Background ' + (i + 1) + '"></button>').join("") + '</div>' +
    '<div class="as-note">Tap <b>Shuffle face</b> until you find one you like, then adjust the skin tone and background.</div>';
  body.onclick = e => {
    const s = e.target.closest("[data-st]"); if(s){ d.i = +s.dataset.st; tabStyles(body); pickDice(); return; }
    const k = e.target.closest("[data-sk]"); if(k){ d.skin = +k.dataset.sk; tabStyles(body); pickDice(); return; }
    const b = e.target.closest("[data-bg]"); if(b){ d.bg = +b.dataset.bg; tabStyles(body); pickDice(); return; }
    if(e.target.closest("#as-shuf")){ d.seed = seed(); pickDice(); }
  };
}

/* ───────── save ───────── */
function toSquareJpeg(blob, size){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size);
      const s = Math.max(size / im.width, size / im.height), w = im.width * s, h = im.height * s;
      g.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error("Couldn’t prepare the picture")), "image/jpeg", .9);
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Couldn’t read the picture")); };
    im.src = u;
  });
}
async function save(){
  const p = ST.pick, btn = $("as-save"); if(!p || ST.saving) return;
  if(navigator.onLine === false){ toast("You’re offline — connect to save your avatar."); return; }
  ST.saving = true; btn.disabled = true; btn.textContent = "⏳ Saving…";
  try{
    const u = me(); if(!u || !u.uid) throw new Error("Please sign in again");
    const jpg = await toSquareJpeg(await p.blob(), 512);
    const url = await uploadPicToCloudinary(new File([jpg], "avatar.jpg", { type: "image/jpeg" }), "profilePics");
    await db.collection("users").doc(u.uid).update({ photoURL: url });
    u.photoURL = url;
    try{ crSessionSave(u); }catch(e){}
    try{ updateAllProfilePicsNow(url); }catch(e){}
    ["cs-av", "cs-acct-av"].forEach(id => { const el = $(id); if(el) el.innerHTML = '<img src="' + S(url) + '" alt="">'; });
    window.dispatchEvent(new CustomEvent("cr-avatar-changed", { detail: { url } }));
    toast("✅ Avatar updated");
    close();
  }catch(e){ console.log("avatar save:", e); toast("❌ Couldn’t save: " + ((e && e.message) || "try again")); }
  finally{ ST.saving = false; btn.textContent = "✅ Use this avatar"; btn.disabled = !ST.pick; }
}

/* ───────── shell ───────── */
function build(){
  if($("as-ov")) return;
  const o = document.createElement("div"); o.className = "as-ov"; o.id = "as-ov";
  o.innerHTML = '<div class="as-sheet"><div class="as-hd"><b>✨ Avatar Studio</b><button type="button" class="as-x" id="as-x" aria-label="Close">✕</button></div>' +
    '<div class="as-prev"><div class="as-circle" id="as-circle"></div><div class="as-cap" id="as-cap">Pick one below</div></div>' +
    '<div class="as-tabs" id="as-tabs"><button type="button" data-t="gallery">🖼 Gallery</button><button type="button" data-t="photo">📸 From my photo</button><button type="button" data-t="styles">🎨 Cartoon styles</button></div>' +
    '<div class="as-body" id="as-body"></div>' +
    '<div class="as-foot"><button type="button" class="as-save" id="as-save" disabled>✅ Use this avatar</button><button type="button" class="as-classic" id="as-classic">🎭 Use the classic avatar builder instead</button></div></div>';
  document.body.appendChild(o);
  o.addEventListener("click", e => { if(e.target === o) close(); });
  $("as-x").onclick = close;
  $("as-save").onclick = save;
  $("as-tabs").onclick = e => { const t = e.target.closest("[data-t]"); if(t) goTab(t.dataset.t); };
  $("as-classic").onclick = () => {
    close();
    const re = /create\s+(your\s+)?avatar/i, ok = n => !n.closest("#as-ov") && (n.textContent || "").trim().length < 40 && re.test(n.textContent || "");
    const el = [...document.querySelectorAll("button,[role=button],.mi,.mp-edit")].find(ok) || [...document.querySelectorAll("div,span")].find(n => !n.children.length && ok(n));
    if(el) el.click(); else toast("Open Edit Profile to use the classic builder.");
  };
}
function goTab(t){
  ST.tab = t;
  document.querySelectorAll("#as-tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  const body = $("as-body"); body.onclick = null; body.scrollTop = 0;
  if(t === "gallery") tabGallery(body);
  else if(t === "photo"){ tabPhoto(body); if(ST.ai.result) { /* keep the previous result selectable */ } }
  else { tabStyles(body); pickDice(); }
}
function open(){
  build();
  const u = me();
  setPick(null); ST.tag = "All";
  if(u && u.photoURL){ showCircle(u.photoURL); const c = $("as-cap"); if(c) c.textContent = "Your current avatar"; }
  $("as-ov").classList.add("open");
  goTab(ST.tab);
}
function close(){ const o = $("as-ov"); if(o) o.classList.remove("open"); }
window.crAvatarStudio = open;

/* ───────── entry point ───────── */
// Avatar Studio is opened from Edit Profile (✨ Avatar Studio, under "Change Photo").
// Clean up the Settings tile an earlier version added, if it is still on the page.
function init(){ const t = $("as-tile"); if(t) t.remove(); }
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
