/* CampusRoom Avatar Studio
   Put this file in the SAME folder as index.html and load it with one line in index.html:
       <script src="avatar.js" defer></script>

   What it does
   - Adds a "🎭 Create avatar" button on the profile page and in Settings (next to "Change Photo").
   - Opens a sheet where the student picks skin tone, hairstyle, hair colour, eyes, brows, mouth, beard,
     glasses, clothes, outfit colour and background, with a live preview.
   - Saving turns the avatar into a normal profile picture (uploaded to your Cloudinary like any photo),
     so posts, chat, comments and friends lists show it with no other change.
   - The choices are also kept in the user's profile (avatarConfig) so they can edit the avatar later.

   Art: Avataaars by Pablo Stanley (free for personal and commercial use), drawn through the free DiceBear API.
*/
(function(){
  "use strict";

  const API = "https://api.dicebear.com/10.x/avataaars/";

  /* ───────────── the items (names come from the DiceBear avataaars style) ───────────── */
  const SKIN   = ["ffdbb4","edb98a","d08b5b","ae5d29","8d5524","614335","3b2219"];
  const HAIR   = ["1a1110","2c1b18","4a312c","724133","a55728","b58143","d6b370","c93305","e8e1e1","f59797","5199e4"];
  const OUTFIT = ["262e33","25557c","5199e4","65c9ff","a7ffc4","929598","e6e6e6","ffffff","ff5c5c","ff488e","ffafb9","ffffb1"];
  const BG     = ["c0aede","b6e3f4","d1d4f9","ffd5dc","ffdfbf","a7ffc4","ffffb1","2c1b5a"];
  const TOP    = ["shortFlat","shortRound","shortCurly","shortWaved","sides","theCaesar","theCaesarAndSidePart","shavedSides","fro","froBand",
                  "dreads","dreads01","dreads02","frizzle","shaggy","shaggyMullet","curly","curvy","bigHair","bob","bun","frida",
                  "longButNotTooLong","miaWallace","straight01","straight02","straightAndStrand","hijab","turban","hat",
                  "winterHat1","winterHat02","winterHat03","winterHat04"];
  const EYES   = ["default","happy","wink","side","surprised","squint","closed","eyeRoll","hearts","winkWacky","cry","xDizzy"];
  const BROWS  = ["defaultNatural","default","flatNatural","raisedExcitedNatural","raisedExcited","sadConcernedNatural","sadConcerned",
                  "frownNatural","angryNatural","angry","upDownNatural","upDown","unibrowNatural"];
  const MOUTH  = ["smile","default","twinkle","serious","concerned","disbelief","grimace","sad","tongue","eating","screamOpen"];
  const BEARD  = ["none","beardLight","beardMedium","beardMajestic","moustacheFancy","moustacheMagnum"];
  const GLASS  = ["none","prescription01","prescription02","round","wayfarers","sunglasses","kurt","eyepatch"];
  const CLOTHES= ["hoodie","shirtCrewNeck","shirtVNeck","shirtScoopNeck","collarAndSweater","blazerAndShirt","blazerAndSweater","graphicShirt","overall"];
  const PRINT  = ["bear","bat","cumbia","deer","diamond","hola","pizza","resist","skull","skullOutline"];

  const TABS = [
    { k: "skin",        t: "Skin",          list: SKIN,    color: true },
    { k: "top",         t: "Hair",          list: TOP },
    { k: "hairColor",   t: "Hair colour",   list: HAIR,    color: true },
    { k: "eyes",        t: "Eyes",          list: EYES },
    { k: "eyebrows",    t: "Brows",         list: BROWS },
    { k: "mouth",       t: "Mouth",         list: MOUTH },
    { k: "facialHair",  t: "Beard",         list: BEARD },
    { k: "accessories", t: "Glasses",       list: GLASS },
    { k: "clothes",     t: "Clothes",       list: CLOTHES },
    { k: "print",       t: "Shirt print",   list: PRINT },
    { k: "clothesColor",t: "Outfit colour", list: OUTFIT,  color: true },
    { k: "background",  t: "Background",    list: BG,      color: true }
  ];
  const SETS = {}; TABS.forEach(t => { SETS[t.k] = t.list; });

  const DEFAULTS = { skin: "ae5d29", top: "shortFlat", hairColor: "2c1b18", eyes: "default", eyebrows: "defaultNatural", mouth: "smile",
                     facialHair: "none", accessories: "none", clothes: "hoodie", print: "bear", clothesColor: "25557c", background: "c0aede" };

  /* only keep values that really exist, so a bad saved value can never break the picture */
  function normalize(raw){
    let o = raw;
    if(typeof raw === "string"){ try{ o = JSON.parse(raw); }catch(e){ o = null; } }
    const out = {};
    Object.keys(DEFAULTS).forEach(k => { out[k] = o && SETS[k].indexOf(o[k]) >= 0 ? o[k] : DEFAULTS[k]; });
    return out;
  }

  function buildUrl(c, fmt, size){
    const q = [];
    const add = (k, v) => q.push(k + "=" + encodeURIComponent(v));
    add("seed", "campusroom");
    add("skinColor", c.skin);
    add("topVariant", c.top); add("topProbability", 100);
    add("hairColor", c.hairColor);
    add("hatColor", c.clothesColor);
    add("eyesVariant", c.eyes); add("eyesProbability", 100);
    add("eyebrowsVariant", c.eyebrows); add("eyebrowsProbability", 100);
    add("mouthVariant", c.mouth); add("mouthProbability", 100);
    add("noseVariant", "default");
    if(c.facialHair !== "none"){ add("facialHairVariant", c.facialHair); add("facialHairProbability", 100); add("facialHairColor", c.hairColor); }
    else add("facialHairProbability", 0);
    if(c.accessories !== "none"){ add("accessoriesVariant", c.accessories); add("accessoriesProbability", 100); }
    else add("accessoriesProbability", 0);
    add("clothesVariant", c.clothes); add("clothesProbability", 100); add("clothesColor", c.clothesColor);
    add("clothesGraphicVariant", c.print);
    add("backgroundColor", c.background);
    if(fmt === "png") add("size", size || 512);
    return API + (fmt === "png" ? "png" : "svg") + "?" + q.join("&");
  }

  const pick = a => a[Math.floor(Math.random() * a.length)];
  function randomCfg(){
    return {
      skin: pick(SKIN), top: pick(TOP), hairColor: pick(HAIR),
      eyes: pick(["default","happy","wink","side","surprised"]), eyebrows: pick(BROWS.slice(0, 8)), mouth: pick(["smile","default","twinkle","serious"]),
      facialHair: Math.random() < 0.25 ? pick(BEARD.slice(1)) : "none", accessories: Math.random() < 0.3 ? pick(GLASS.slice(1, 6)) : "none",
      clothes: pick(CLOTHES), print: pick(PRINT), clothesColor: pick(OUTFIT), background: pick(BG)
    };
  }

  /* running under Node (tests) — nothing else to do */
  if(typeof document === "undefined"){
    if(typeof module !== "undefined") module.exports = { buildUrl, normalize, randomCfg, SETS, DEFAULTS };
    return;
  }

  /* ───────────── the screen ───────────── */
  const nice = v => v === "none" ? "None" : String(v).replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
  const $ = id => document.getElementById(id);
  const toast = m => { try{ if(typeof showToast === "function"){ showToast(m); return; } }catch(e){} alert(m); };

  let cfg = normalize(null), tab = "top", built = false, busy = false, timer = null;

  function addStyle(){
    const st = document.createElement("style");
    st.textContent = `
      #cr-av-bd{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.62);z-index:100000;display:none}
      #cr-av-bd.open{display:block}
      #cr-av-sheet{position:fixed;left:0;right:0;bottom:0;max-height:94vh;z-index:100001;display:none;flex-direction:column;
        background:var(--bg,#0a0414);border:1px solid var(--border,#2a1a4a);border-bottom:0;border-radius:22px 22px 0 0;color:var(--off,#f2ecff);font-family:inherit}
      #cr-av-sheet.open{display:flex}
      .cr-av-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 6px;font-weight:800;font-size:17px}
      .cr-av-hd button{background:transparent;border:0;color:inherit;font-size:20px;padding:4px 8px}
      #cr-av-prev{position:relative;width:150px;height:150px;margin:4px auto 8px;border-radius:50%;overflow:hidden;border:3px solid var(--plight,#b48cff);background:#1a1030;flex-shrink:0}
      #cr-av-prev img{width:100%;height:100%;display:block;object-fit:cover}
      #cr-av-prev.load::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,4,20,.55)}
      #cr-av-err{min-height:16px;text-align:center;font-size:12px;color:#ff8a8a;padding:0 16px}
      .cr-av-row{display:flex;gap:8px;justify-content:center;padding:2px 16px 8px}
      .cr-av-row button{padding:8px 14px;border-radius:16px;border:1px solid var(--gb,#3b2a66);background:var(--glass,rgba(255,255,255,.06));color:var(--plight,#c4a8ff);font-weight:700;font-size:13px}
      #cr-av-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px 12px 8px;flex-shrink:0;-webkit-overflow-scrolling:touch}
      .cr-av-tab{flex-shrink:0;padding:8px 13px;border-radius:16px;border:1px solid var(--border,#2a1a4a);background:transparent;color:var(--muted,#a99cc8);font-weight:700;font-size:13px}
      .cr-av-tab.on{background:linear-gradient(135deg,var(--purple,#7c3aed),var(--p2,#9b5cff));color:#fff;border-color:transparent}
      #cr-av-opts{display:flex;flex-wrap:wrap;gap:8px;padding:6px 14px 12px;overflow-y:auto;min-height:96px;max-height:30vh;-webkit-overflow-scrolling:touch}
      .cr-av-ch{padding:9px 13px;border-radius:14px;border:1px solid var(--border,#2a1a4a);background:var(--card,#150a28);color:var(--off,#f2ecff);font-size:13px}
      .cr-av-ch.on{border-color:var(--plight,#b48cff);box-shadow:0 0 0 2px rgba(180,140,255,.35);font-weight:800}
      .cr-av-sw{width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,.25);padding:0}
      .cr-av-sw.on{border-color:#fff;box-shadow:0 0 0 3px rgba(180,140,255,.7)}
      .cr-av-ft{padding:8px 16px 14px;flex-shrink:0}
      #cr-av-save{width:100%;padding:14px;border-radius:16px;border:0;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--purple,#7c3aed),var(--p2,#9b5cff))}
      #cr-av-save[disabled]{opacity:.55}
      #cr-av-prog{min-height:16px;text-align:center;font-size:12px;color:var(--plight,#c4a8ff);padding-bottom:6px}
      .cr-av-cr{text-align:center;font-size:10px;color:var(--muted,#a99cc8);padding-top:6px}
      .cr-av-pill{display:inline-block;margin:6px 0;padding:7px 14px;border-radius:16px;border:1px solid var(--gb,#3b2a66);background:var(--glass,rgba(255,255,255,.06));color:var(--plight,#c4a8ff);font-weight:700;font-size:13px;cursor:pointer}
    `;
    document.head.appendChild(st);
  }

  function build(){
    if(built) return; built = true; addStyle();
    const bd = document.createElement("div"); bd.id = "cr-av-bd";
    const sh = document.createElement("div"); sh.id = "cr-av-sheet";
    sh.innerHTML = `
      <div class="cr-av-hd"><span>🎭 Create your avatar</span><button type="button" id="cr-av-x" aria-label="Close">✕</button></div>
      <div id="cr-av-prev" class="load"><img id="cr-av-img" alt="Your avatar"></div>
      <div id="cr-av-err"></div>
      <div class="cr-av-row"><button type="button" id="cr-av-rnd">🎲 Surprise me</button><button type="button" id="cr-av-rst">↺ Reset</button></div>
      <div id="cr-av-tabs"></div>
      <div id="cr-av-opts"></div>
      <div class="cr-av-ft"><div id="cr-av-prog"></div><button type="button" id="cr-av-save">✅ Save avatar</button><div class="cr-av-cr">Avatar art: Avataaars by Pablo Stanley</div></div>`;
    document.body.append(bd, sh);

    bd.addEventListener("click", close);
    $("cr-av-x").addEventListener("click", close);
    $("cr-av-rnd").addEventListener("click", () => { cfg = randomCfg(); drawOpts(); preview(); });
    $("cr-av-rst").addEventListener("click", () => { cfg = normalize(null); drawOpts(); preview(); });
    $("cr-av-save").addEventListener("click", save);
    $("cr-av-tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if(!b) return; tab = b.dataset.tab; drawTabs(); drawOpts(); });
    $("cr-av-opts").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if(!b) return; cfg[tab] = b.dataset.v; drawOpts(); preview(); });
    const img = $("cr-av-img"), box = $("cr-av-prev");
    img.addEventListener("load", () => { box.classList.remove("load"); $("cr-av-err").textContent = ""; });
    img.addEventListener("error", () => { box.classList.remove("load"); $("cr-av-err").textContent = "Couldn't load the preview. Check your internet and try again."; });
  }

  function drawTabs(){
    $("cr-av-tabs").innerHTML = TABS.map(t => `<button type="button" class="cr-av-tab${t.k === tab ? " on" : ""}" data-tab="${t.k}">${t.t}</button>`).join("");
  }
  function drawOpts(){
    const t = TABS.find(x => x.k === tab) || TABS[0];
    $("cr-av-opts").innerHTML = t.list.map(v => t.color
      ? `<button type="button" class="cr-av-sw${cfg[t.k] === v ? " on" : ""}" data-v="${v}" style="background:#${v}" aria-label="Colour ${v}"></button>`
      : `<button type="button" class="cr-av-ch${cfg[t.k] === v ? " on" : ""}" data-v="${v}">${nice(v)}</button>`).join("");
  }
  function preview(){
    $("cr-av-prev").classList.add("load");
    clearTimeout(timer);
    timer = setTimeout(() => { $("cr-av-img").src = buildUrl(cfg, "svg"); }, 120);
  }
  const prog = m => { const p = $("cr-av-prog"); if(p) p.textContent = m || ""; };

  function open(){
    let user = null; try{ user = typeof CU !== "undefined" ? CU : null; }catch(e){}
    if(!user || !user.uid){ toast("❌ Please sign in first"); return; }
    build();
    cfg = normalize(user.avatarConfig); tab = "top"; prog("");
    drawTabs(); drawOpts(); preview();
    $("cr-av-bd").classList.add("open"); $("cr-av-sheet").classList.add("open");
  }
  function close(){
    if(busy) return;
    const bd = $("cr-av-bd"), sh = $("cr-av-sheet");
    if(bd) bd.classList.remove("open"); if(sh) sh.classList.remove("open");
  }

  async function save(){
    if(busy) return;
    let user = null, database = null;
    try{ user = typeof CU !== "undefined" ? CU : null; database = typeof db !== "undefined" ? db : null; }catch(e){}
    if(!user || !user.uid || !database){ toast("❌ Please sign in again"); return; }
    busy = true; $("cr-av-save").disabled = true; prog("⏳ Saving your avatar…");

    const svgUrl = buildUrl(cfg, "svg");
    let photo = svgUrl;                                   // fallback: use the avatar link directly
    try{
      const r = await fetch(buildUrl(cfg, "png", 512));
      if(!r.ok) throw new Error("PNG " + r.status);
      const blob = await r.blob();
      if(blob.size < 500) throw new Error("PNG too small");
      photo = (await uploadPicToCloudinary(new File([blob], "avatar.png", { type: "image/png" }), "profilePics")) || svgUrl;
    }catch(e){ console.warn("Avatar: saving the direct link instead of an upload", e); photo = svgUrl; }

    let conf = JSON.stringify(cfg);
    try{
      const ref = database.collection("users").doc(user.uid);
      try{ await ref.update({ photoURL: photo, avatarConfig: conf }); }
      catch(e1){ await ref.update({ photoURL: photo }); conf = ""; }      // in case your rules don't allow the extra field
      user.photoURL = photo; if(conf) user.avatarConfig = conf;
      try{ if(typeof updateAllProfilePicsNow === "function") updateAllProfilePicsNow(photo); }catch(e){}
      busy = false; toast("✅ Avatar saved!"); close();
    }catch(e){
      console.error("Avatar save failed", e);
      prog("❌ Couldn't save. Check your internet and try again."); toast("❌ Couldn't save your avatar. Try again.");
    }
    busy = false; const sv = $("cr-av-save"); if(sv) sv.disabled = false;
  }

  /* ───────────── add the buttons to the app ───────────── */
  function inject(){
    document.querySelectorAll(".settings-change-pic").forEach(el => {
      if(el.dataset.crAv) return; el.dataset.crAv = "1";
      const b = document.createElement("div"); b.className = "settings-change-pic"; b.textContent = "🎭 Create Avatar"; b.style.marginTop = "8px";
      b.addEventListener("click", open); el.insertAdjacentElement("afterend", b);
    });
    const p = $("pic-progress");
    if(p && !p.dataset.crAv){
      p.dataset.crAv = "1";
      const b = document.createElement("div"); b.className = "cr-av-pill"; b.textContent = "🎭 Create avatar";
      b.addEventListener("click", open); p.insertAdjacentElement("afterend", b);
    }
  }
  inject(); setInterval(inject, 2000);                  // the app builds some screens later, so keep checking
  window.crOpenAvatar = open;
})();
