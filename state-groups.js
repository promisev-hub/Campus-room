/* CampusRoom — verified State & LGA groups (students and alumni only)
 *
 *  • A student / alumnus sends a verification request (ID card, admission letter / fees receipt, or certificate / result).
 *  • The app shows "Request sent to join group" and an AI pre-check reads the document for the rep.
 *  • A rep for that person's STATE approves it (reps are added by an admin). Only then is the person added to
 *    their State group and their LGA group. Without verification they are never added.
 *
 * Loaded with <script src="state-groups.js" defer></script> in index.html.
 * Needs: api/verify-id.js (AI pre-check) and the Firestore rules in firestore-rules-state-groups.txt.
 */
(function(){
"use strict";

/* ───────── helpers ───────── */
const $ = id => document.getElementById(id);
const S = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = m => { try{ if(typeof window.showToast === "function") window.showToast(m); }catch(e){} };
const me = () => { try{ return typeof CU !== "undefined" ? CU : null; }catch(e){ return null; } };
const dbx = () => { try{ return typeof db !== "undefined" ? db : null; }catch(e){ return null; } };
const authx = () => { try{ return typeof auth !== "undefined" ? auth : null; }catch(e){ return null; } };
const FV = () => firebase.firestore.FieldValue;
const slug = s => { try{ if(typeof crSlug === "function") return crSlug(s); }catch(e){} return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); };
const eligible = u => !!u && (u.role === "Student" || u.role === "Alumni");
const AI_URL = (function(){ const e = window.CR_AI_ENDPOINT; return e ? String(e).replace(/\/[^\/]*\/?$/, "/verify-id") : "/api/verify-id"; })();
const PROOFS = {
  "student-id": { icon: "🪪", label: "Student ID card" },
  "admission":  { icon: "🧾", label: "Admission letter / fees receipt" },
  "certificate":{ icon: "🎓", label: "Certificate / result" }
};
const ago = ts => { try{ const t = ts && ts.toDate ? ts.toDate() : null; if(!t) return ""; const m = Math.round((Date.now() - t) / 60000); if(m < 1) return "just now"; if(m < 60) return m + " min ago"; if(m < 1440) return Math.round(m / 60) + " h ago"; return Math.round(m / 1440) + " d ago"; }catch(e){ return ""; } };

/* ───────── Nigerian LGAs (pick yours, or type it if it isn't listed) ───────── */
const LGA = {
"Abia":"Aba North,Aba South,Arochukwu,Bende,Ikwuano,Isiala Ngwa North,Isiala Ngwa South,Isuikwuato,Obi Ngwa,Ohafia,Osisioma,Ugwunagbo,Ukwa East,Ukwa West,Umuahia North,Umuahia South,Umu Nneochi",
"Adamawa":"Demsa,Fufure,Ganye,Gayuk,Gombi,Grie,Hong,Jada,Lamurde,Madagali,Maiha,Mayo Belwa,Michika,Mubi North,Mubi South,Numan,Shelleng,Song,Toungo,Yola North,Yola South",
"Akwa Ibom":"Abak,Eastern Obolo,Eket,Esit Eket,Essien Udim,Etim Ekpo,Etinan,Ibeno,Ibesikpo Asutan,Ibiono Ibom,Ika,Ikono,Ikot Abasi,Ikot Ekpene,Ini,Itu,Mbo,Mkpat Enin,Nsit Atai,Nsit Ibom,Nsit Ubium,Obot Akara,Okobo,Onna,Oron,Oruk Anam,Udung Uko,Ukanafun,Uruan,Urue-Offong/Oruko,Uyo",
"Anambra":"Aguata,Anambra East,Anambra West,Anaocha,Awka North,Awka South,Ayamelum,Dunukofia,Ekwusigo,Idemili North,Idemili South,Ihiala,Njikoka,Nnewi North,Nnewi South,Ogbaru,Onitsha North,Onitsha South,Orumba North,Orumba South,Oyi",
"Bauchi":"Alkaleri,Bauchi,Bogoro,Damban,Darazo,Dass,Gamawa,Ganjuwa,Giade,Itas/Gadau,Jama'are,Katagum,Kirfi,Misau,Ningi,Shira,Tafawa Balewa,Toro,Warji,Zaki",
"Bayelsa":"Brass,Ekeremor,Kolokuma/Opokuma,Nembe,Ogbia,Sagbama,Southern Ijaw,Yenagoa",
"Benue":"Ado,Agatu,Apa,Buruku,Gboko,Guma,Gwer East,Gwer West,Katsina-Ala,Konshisha,Kwande,Logo,Makurdi,Obi,Ogbadibo,Ohimini,Oju,Okpokwu,Otukpo,Tarka,Ukum,Ushongo,Vandeikya",
"Borno":"Abadam,Askira/Uba,Bama,Bayo,Biu,Chibok,Damboa,Dikwa,Gubio,Guzamala,Gwoza,Hawul,Jere,Kaga,Kala/Balge,Konduga,Kukawa,Kwaya Kusar,Mafa,Magumeri,Maiduguri,Marte,Mobbar,Monguno,Ngala,Nganzai,Shani",
"Cross River":"Abi,Akamkpa,Akpabuyo,Bakassi,Bekwarra,Biase,Boki,Calabar Municipal,Calabar South,Etung,Ikom,Obanliku,Obubra,Obudu,Odukpani,Ogoja,Yakuur,Yala",
"Delta":"Aniocha North,Aniocha South,Bomadi,Burutu,Ethiope East,Ethiope West,Ika North East,Ika South,Isoko North,Isoko South,Ndokwa East,Ndokwa West,Okpe,Oshimili North,Oshimili South,Patani,Sapele,Udu,Ughelli North,Ughelli South,Ukwuani,Uvwie,Warri North,Warri South,Warri South West",
"Ebonyi":"Abakaliki,Afikpo North,Afikpo South,Ebonyi,Ezza North,Ezza South,Ikwo,Ishielu,Ivo,Izzi,Ohaozara,Ohaukwu,Onicha",
"Edo":"Akoko-Edo,Egor,Esan Central,Esan North-East,Esan South-East,Esan West,Etsako Central,Etsako East,Etsako West,Igueben,Ikpoba Okha,Oredo,Orhionmwon,Ovia North-East,Ovia South-West,Owan East,Owan West,Uhunmwonde",
"Ekiti":"Ado Ekiti,Efon,Ekiti East,Ekiti South-West,Ekiti West,Emure,Gbonyin,Ido Osi,Ijero,Ikere,Ikole,Ilejemeje,Irepodun/Ifelodun,Ise/Orun,Moba,Oye",
"Enugu":"Aninri,Awgu,Enugu East,Enugu North,Enugu South,Ezeagu,Igbo Etiti,Igbo Eze North,Igbo Eze South,Isi Uzo,Nkanu East,Nkanu West,Nsukka,Oji River,Udenu,Udi,Uzo Uwani",
"FCT":"Abaji,Bwari,Gwagwalada,Kuje,Kwali,Municipal Area Council",
"Gombe":"Akko,Balanga,Billiri,Dukku,Funakaye,Gombe,Kaltungo,Kwami,Nafada,Shongom,Yamaltu/Deba",
"Imo":"Aboh Mbaise,Ahiazu Mbaise,Ehime Mbano,Ezinihitte,Ideato North,Ideato South,Ihitte/Uboma,Ikeduru,Isiala Mbano,Isu,Mbaitoli,Ngor Okpala,Njaba,Nkwerre,Nwangele,Obowo,Oguta,Ohaji/Egbema,Okigwe,Orlu,Orsu,Oru East,Oru West,Owerri Municipal,Owerri North,Owerri West,Unuimo",
"Jigawa":"Auyo,Babura,Biriniwa,Birnin Kudu,Buji,Dutse,Gagarawa,Garki,Gumel,Guri,Gwaram,Gwiwa,Hadejia,Jahun,Kafin Hausa,Kaugama,Kazaure,Kiri Kasama,Kiyawa,Maigatari,Malam Madori,Miga,Ringim,Roni,Sule Tankarkar,Taura,Yankwashi",
"Kaduna":"Birnin Gwari,Chikun,Giwa,Igabi,Ikara,Jaba,Jema'a,Kachia,Kaduna North,Kaduna South,Kagarko,Kajuru,Kaura,Kauru,Kubau,Kudan,Lere,Makarfi,Sabon Gari,Sanga,Soba,Zangon Kataf,Zaria",
"Kano":"Ajingi,Albasu,Bagwai,Bebeji,Bichi,Bunkure,Dala,Dambatta,Dawakin Kudu,Dawakin Tofa,Doguwa,Fagge,Gabasawa,Garko,Garun Mallam,Gaya,Gezawa,Gwale,Gwarzo,Kabo,Kano Municipal,Karaye,Kibiya,Kiru,Kumbotso,Kunchi,Kura,Madobi,Makoda,Minjibir,Nasarawa,Rano,Rimin Gado,Rogo,Shanono,Sumaila,Takai,Tarauni,Tofa,Tsanyawa,Tudun Wada,Ungogo,Warawa,Wudil",
"Katsina":"Bakori,Batagarawa,Batsari,Baure,Bindawa,Charanchi,Dan Musa,Dandume,Danja,Daura,Dutsi,Dutsin-Ma,Faskari,Funtua,Ingawa,Jibia,Kafur,Kaita,Kankara,Kankia,Katsina,Kurfi,Kusada,Mai'Adua,Malumfashi,Mani,Mashi,Matazu,Musawa,Rimi,Sabuwa,Safana,Sandamu,Zango",
"Kebbi":"Aleiro,Arewa Dandi,Argungu,Augie,Bagudo,Birnin Kebbi,Bunza,Dandi,Fakai,Gwandu,Jega,Kalgo,Koko/Besse,Maiyama,Ngaski,Sakaba,Shanga,Suru,Wasagu/Danko,Yauri,Zuru",
"Kogi":"Adavi,Ajaokuta,Ankpa,Bassa,Dekina,Ibaji,Idah,Igalamela-Odolu,Ijumu,Kabba/Bunu,Kogi,Lokoja,Mopa-Muro,Ofu,Ogori/Magongo,Okehi,Okene,Olamaboro,Omala,Yagba East,Yagba West",
"Kwara":"Asa,Baruten,Edu,Ekiti,Ifelodun,Ilorin East,Ilorin South,Ilorin West,Irepodun,Isin,Kaiama,Moro,Offa,Oke Ero,Oyun,Pategi",
"Lagos":"Agege,Ajeromi-Ifelodun,Alimosho,Amuwo-Odofin,Apapa,Badagry,Epe,Eti-Osa,Ibeju-Lekki,Ifako-Ijaiye,Ikeja,Ikorodu,Kosofe,Lagos Island,Lagos Mainland,Mushin,Ojo,Oshodi-Isolo,Shomolu,Surulere",
"Nasarawa":"Akwanga,Awe,Doma,Karu,Keana,Keffi,Kokona,Lafia,Nasarawa,Nasarawa Egon,Obi,Toto,Wamba",
"Niger":"Agaie,Agwara,Bida,Borgu,Bosso,Chanchaga,Edati,Gbako,Gurara,Katcha,Kontagora,Lapai,Lavun,Magama,Mariga,Mashegu,Mokwa,Moya,Paikoro,Rafi,Rijau,Shiroro,Suleja,Tafa,Wushishi",
"Ogun":"Abeokuta North,Abeokuta South,Ado-Odo/Ota,Egbado North,Egbado South,Ewekoro,Ifo,Ijebu East,Ijebu North,Ijebu North East,Ijebu Ode,Ikenne,Imeko Afon,Ipokia,Obafemi Owode,Odeda,Odogbolu,Ogun Waterside,Remo North,Shagamu",
"Ondo":"Akoko North-East,Akoko North-West,Akoko South-East,Akoko South-West,Akure North,Akure South,Ese Odo,Idanre,Ifedore,Ilaje,Ile Oluji/Okeigbo,Irele,Odigbo,Okitipupa,Ondo East,Ondo West,Ose,Owo",
"Osun":"Aiyedaade,Aiyedire,Atakunmosa East,Atakunmosa West,Boluwaduro,Boripe,Ede North,Ede South,Egbedore,Ejigbo,Ife Central,Ife East,Ife North,Ife South,Ifedayo,Ifelodun,Ila,Ilesa East,Ilesa West,Irepodun,Irewole,Isokan,Iwo,Obokun,Odo Otin,Ola Oluwa,Olorunda,Oriade,Orolu,Osogbo",
"Oyo":"Afijio,Akinyele,Atiba,Atisbo,Egbeda,Ibadan North,Ibadan North-East,Ibadan North-West,Ibadan South-East,Ibadan South-West,Ibarapa Central,Ibarapa East,Ibarapa North,Ido,Irepo,Iseyin,Itesiwaju,Iwajowa,Kajola,Lagelu,Ogbomosho North,Ogbomosho South,Ogo Oluwa,Olorunsogo,Oluyole,Ona Ara,Orelope,Ori Ire,Oyo East,Oyo West,Saki East,Saki West,Surulere",
"Plateau":"Barkin Ladi,Bassa,Bokkos,Jos East,Jos North,Jos South,Kanam,Kanke,Langtang North,Langtang South,Mangu,Mikang,Pankshin,Qua'an Pan,Riyom,Shendam,Wase",
"Rivers":"Abua/Odual,Ahoada East,Ahoada West,Akuku-Toru,Andoni,Asari-Toru,Bonny,Degema,Eleme,Emuoha,Etche,Gokana,Ikwerre,Khana,Obio/Akpor,Ogba/Egbema/Ndoni,Ogu/Bolo,Okrika,Omuma,Opobo/Nkoro,Oyigbo,Port Harcourt,Tai",
"Sokoto":"Binji,Bodinga,Dange Shuni,Gada,Goronyo,Gudu,Gwadabawa,Illela,Isa,Kebbe,Kware,Rabah,Sabon Birni,Shagari,Silame,Sokoto North,Sokoto South,Tambuwal,Tangaza,Tureta,Wamako,Wurno,Yabo",
"Taraba":"Ardo Kola,Bali,Donga,Gashaka,Gassol,Ibi,Jalingo,Karim Lamido,Kurmi,Lau,Sardauna,Takum,Ussa,Wukari,Yorro,Zing",
"Yobe":"Bade,Bursari,Damaturu,Fika,Fune,Geidam,Gujba,Gulani,Jakusko,Karasuwa,Machina,Nangere,Nguru,Potiskum,Tarmuwa,Yunusari,Yusufari",
"Zamfara":"Anka,Bakura,Birnin Magaji/Kiyaw,Bukkuyum,Bungudu,Gummi,Gusau,Kaura Namoda,Maradun,Maru,Shinkafi,Talata Mafara,Tsafe,Zurmi"
};
const lgaList = st => (LGA[st] || "").split(",").map(x => x.trim()).filter(Boolean);
const STATE_LIST = () => { try{ if(typeof STATES !== "undefined" && STATES.length) return STATES; }catch(e){} return Object.keys(LGA); };

/* ───────── styles ───────── */
const css = document.createElement("style");
css.textContent = `
.sg-ov{position:fixed;inset:0;z-index:9650;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;}
.sg-ov.open{display:flex;}
.sg-sheet{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;background:var(--bg,#0A0014);border:1px solid var(--border);border-bottom:0;border-radius:22px 22px 0 0;padding:16px 16px calc(22px + env(safe-area-inset-bottom,0px));color:var(--off);}
.sg-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.sg-hd b{font-family:var(--fd);font-size:calc(17px * var(--fs,1));}
.sg-x{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:0;color:var(--muted);cursor:pointer;}
.sg-sub{font-size:calc(12px * var(--fs,1));color:var(--muted);line-height:1.55;margin-bottom:12px;}
.sg-l{display:block;font-size:calc(11px * var(--fs,1));font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin:12px 0 6px;font-family:var(--fd);}
.sg-sheet input[type=text],.sg-sheet select{width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(var(--pr),.1);color:var(--off);font-size:calc(14px * var(--fs,1));font-family:inherit;}
.sg-ro{padding:12px;border-radius:12px;border:1px dashed var(--border);color:var(--off);font-size:calc(14px * var(--fs,1));font-weight:700;}
.sg-chips{display:flex;flex-direction:column;gap:8px;}
.sg-chips button{display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border-radius:12px;border:2px solid transparent;background:rgba(var(--pr),.12);color:var(--off);font-size:calc(13px * var(--fs,1));font-weight:700;cursor:pointer;}
.sg-chips button.on{border-color:var(--plight);background:rgba(var(--pr),.22);}
.sg-photo{display:flex;gap:10px;margin-top:4px;}
.sg-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(var(--pr),.14);color:var(--off);font-family:var(--fd);font-weight:800;font-size:calc(13px * var(--fs,1));cursor:pointer;}
.sg-btn.pri,.sg-pri{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.sg-btn.ok{background:rgba(110,231,183,.16);border-color:rgba(110,231,183,.5);color:#6EE7B7;}
.sg-btn.no{background:rgba(255,107,129,.12);border-color:rgba(255,107,129,.45);color:#ff6b81;}
.sg-btn:disabled,.sg-pri:disabled{opacity:.45;}
.sg-pri{width:100%;margin-top:14px;padding:14px;border-radius:14px;border:0;font-family:var(--fd);font-weight:800;font-size:calc(15px * var(--fs,1));cursor:pointer;}
.sg-prev{margin-top:10px;border-radius:14px;overflow:hidden;background:#000;display:none;}
.sg-prev img{width:100%;max-height:240px;object-fit:contain;display:block;}
.sg-ck{display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-size:calc(12px * var(--fs,1));color:var(--muted);line-height:1.5;}
.sg-ck input{margin-top:2px;}
.sg-msg{text-align:center;padding:18px 6px;line-height:1.6;font-size:calc(13px * var(--fs,1));color:var(--off);}
.sg-msg .big{font-size:44px;display:block;margin-bottom:6px;}
.sg-err{color:var(--rlight,#ff6b81);font-size:calc(12px * var(--fs,1));margin-top:8px;min-height:14px;text-align:center;}
.sg-card{display:flex;align-items:center;gap:12px;margin:8px calc(12px * var(--sp,1));padding:12px 14px;border-radius:16px;border:1px solid var(--border);background:rgba(var(--pr),.14);cursor:pointer;}
.sg-card>span:first-child{font-size:calc(24px * var(--fs,1));}
.sg-card div{flex:1;min-width:0;}
.sg-card b{display:block;font-size:calc(13px * var(--fs,1));}
.sg-card small{display:block;font-size:calc(11px * var(--fs,1));color:var(--muted);margin-top:2px;line-height:1.4;}
.sg-card .sg-go{flex:0 0 auto;padding:7px 12px;border-radius:10px;background:var(--p3,#7B00FF);color:#fff;font-weight:800;font-size:calc(12px * var(--fs,1));}
.sg-card .sg-xx{flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:none;border:0;color:var(--muted);cursor:pointer;}
.sg-card.pending{border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.1);}
.sg-card.rejected{border-color:rgba(255,107,129,.5);background:rgba(255,107,129,.1);}
.sg-req{padding:12px;border-radius:16px;border:1px solid var(--border);background:rgba(var(--pr),.1);margin-bottom:12px;}
.sg-rh{display:flex;align-items:center;gap:8px;}
.sg-rh b{flex:1;font-size:calc(14px * var(--fs,1));}
.sg-tag{font-size:calc(10px * var(--fs,1));font-weight:800;color:var(--plight);background:rgba(var(--pr),.2);border-radius:999px;padding:3px 9px;}
.sg-req small{display:block;font-size:calc(11px * var(--fs,1));color:var(--muted);margin-top:4px;line-height:1.45;}
.sg-ai{margin-top:8px;padding:8px 10px;border-radius:10px;font-size:calc(12px * var(--fs,1));line-height:1.45;background:rgba(255,255,255,.05);}
.sg-ai.good{background:rgba(110,231,183,.12);color:#6EE7B7;}
.sg-ai.warn{background:rgba(245,158,11,.12);color:#FCD34D;}
.sg-ai.bad{background:rgba(255,107,129,.12);color:#ff6b81;}
.sg-acts{display:flex;gap:8px;margin-top:8px;}
.sg-reasons{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px;}
.sg-reasons button{padding:8px 12px;border-radius:999px;border:1px solid var(--border);background:rgba(var(--pr),.12);color:var(--off);font-size:calc(12px * var(--fs,1));font-weight:700;cursor:pointer;}
.sg-reasons button.on{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
.sg-img{position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;}
.sg-img.open{display:flex;}
.sg-img img{max-width:100%;max-height:100%;object-fit:contain;}
.sg-img button{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;}
.sg-rep{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
.sg-rep div{flex:1;min-width:0;font-size:calc(13px * var(--fs,1));}
.sg-rep small{display:block;color:var(--muted);font-size:calc(11px * var(--fs,1));}
.sg-sts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;}
.sg-sts button{padding:6px 10px;border-radius:999px;border:1px solid var(--border);background:rgba(var(--pr),.1);color:var(--off);font-size:calc(11px * var(--fs,1));font-weight:700;cursor:pointer;}
.sg-sts button.on{background:var(--p3,#7B00FF);border-color:transparent;color:#fff;}
`;
document.head.appendChild(css);

/* ───────── my verification status (live) ───────── */
let VS;                       // undefined = not loaded yet · null = no request · object = the request
let unsub = null, seenUid = "";
function listen(){
  const u = me(), d = dbx(); if(!u || !u.uid || !d) return;
  if(seenUid === u.uid && unsub) return;
  stop(); seenUid = u.uid;
  if(!eligible(u)){ VS = null; return; }
  unsub = d.collection("verifications").doc(u.uid).onSnapshot(snap => {
    const was = VS; VS = snap.exists ? snap.data() : null;
    repaintCard();
    if(VS && VS.status === "approved" && !(me() || {}).verified) activateApproval();
    if(SG_OPEN && !$("sg-send")) renderSheet();          // never re-draw while the form is open
  }, err => { console.log("verification listener:", err && err.code); VS = null; repaintCard(); });
}
function stop(){ if(unsub){ try{ unsub(); }catch(e){} } unsub = null; seenUid = ""; VS = undefined; }
async function activateApproval(){
  const u = me(), d = dbx(); if(!u || !d) return;
  try{
    const s = await d.collection("users").doc(u.uid).get();
    if(s.exists){ const x = s.data(); ["verified", "verifiedType", "verifiedState", "lga", "verifiedAt", "verifiedBy"].forEach(k => { if(x[k] !== undefined) u[k] = x[k]; }); }
    if(typeof createAndJoinAutoGroups === "function") await createAndJoinAutoGroups();
    toast("🎉 Verified! You joined your " + (u.verifiedState || "state") + " groups");
    repaintCard();
    try{ if(typeof loadRealUsers === "function") loadRealUsers(); }catch(e){}
  }catch(e){ console.log("activate approval:", e && e.code); }
}

/* the two verified groups are added to the auto-group list ONLY for verified students/alumni */
(function(){
  const orig = window.crAutoGroupList; if(typeof orig !== "function" || orig.__sg) return;
  const w = function(){
    const out = orig.apply(this, arguments), u = me();
    try{
      if(u && u.verified === true && eligible(u) && u.verifiedState){
        const st = u.verifiedState;
        out.push({ id: "v3_state_" + slug(st), name: st + " State · Students & Alumni", desc: "Verified students & alumni from " + st + " State", icon: "🗺️", requiresVerified: true, stateKey: st });
        if(u.lga) out.push({ id: "v3_lga_" + slug(st) + "__" + slug(u.lga), name: u.lga + " LGA · " + st, desc: "Verified students & alumni from " + u.lga + ", " + st + " State", icon: "📍", requiresVerified: true, stateKey: st, lgaKey: u.lga });
      }
    }catch(e){}
    return out;
  };
  w.__sg = true; window.crAutoGroupList = w;
})();

/* ───────── the card on the Messages list ───────── */
const DKEY = u => "cr_sg_dismiss_" + u;
function renderCard(list){
  const old = $("sg-card"); if(old) old.remove();
  const u = me(); if(!list || !u || !eligible(u) || u.verified === true || VS === undefined) return;
  const f = (typeof chatFilter !== "undefined") ? chatFilter : "All"; if(f === "Friends" || f === "Unread") return;
  let cls = "", html = "";
  const st = u.state ? u.state + " State" : "your state";
  if(VS && VS.status === "pending"){
    cls = "pending";
    html = '<span>⏳</span><div><b>Request sent to join ' + S(st) + ' groups</b><small>Your state rep will check your document and approve it.</small></div>';
  }else if(VS && VS.status === "rejected"){
    cls = "rejected";
    html = '<span>❌</span><div><b>Request not approved</b><small>' + S(VS.reason || "Please send a clearer document.") + '</small></div><span class="sg-go">Try again</span>';
  }else{
    let hidden = false; try{ hidden = Date.now() - (+localStorage.getItem(DKEY(u.uid)) || 0) < 3 * 86400000; }catch(e){}
    if(hidden) return;
    html = '<span>🗺️</span><div><b>Join your ' + S(st) + ' &amp; LGA groups</b><small>Verify you’re a ' + S(String(u.role).toLowerCase()) + ' to meet people from your state.</small></div><span class="sg-go">Verify</span><button type="button" class="sg-xx" data-dis="1" aria-label="Not now">✕</button>';
  }
  const c = document.createElement("div"); c.id = "sg-card"; c.className = "sg-card " + cls; c.innerHTML = html;
  c.addEventListener("click", e => {
    if(e.target.closest("[data-dis]")){ e.stopPropagation(); try{ localStorage.setItem(DKEY(u.uid), String(Date.now())); }catch(x){} c.remove(); return; }
    openSheet();
  });
  list.insertBefore(c, list.firstChild);
}
function repaintCard(){ const l = $("clist"); if(l) renderCard(l); }
(function(){
  const prev = window.crRenderGroupInvites;
  window.crRenderGroupInvites = function(list){ if(typeof prev === "function") prev.apply(this, arguments); try{ renderCard(list); }catch(e){} };
})();

/* ───────── the person's sheet: form · pending · rejected · done ───────── */
let SG_OPEN = false, IMG = "", PROOF = "", SENT = false, BUSY = false;
function ensureOv(){
  if($("sg-ov")) return;
  const o = document.createElement("div"); o.className = "sg-ov"; o.id = "sg-ov";
  o.innerHTML = '<div class="sg-sheet" id="sg-sheet"></div>';
  document.body.appendChild(o);
  o.addEventListener("click", onSheetClick);
  o.addEventListener("change", onSheetChange);
}
function openSheet(){ ensureOv(); SG_OPEN = true; SENT = false; IMG = ""; PROOF = (me() || {}).role === "Alumni" ? "certificate" : "student-id"; renderSheet(); $("sg-ov").classList.add("open"); }
function closeSheet(){ SG_OPEN = false; const o = $("sg-ov"); if(o) o.classList.remove("open"); }
const head = t => '<div class="sg-hd"><b>' + t + '</b><button type="button" class="sg-x" data-x="1" aria-label="Close">✕</button></div>';

function renderSheet(){
  const box = $("sg-sheet"); if(!box) return;
  const u = me() || {};
  if(!eligible(u)){ box.innerHTML = head("🗺️ State groups") + '<div class="sg-msg"><span class="big">🎓</span>State and LGA groups are for <b>students and alumni</b> only.</div>'; return; }
  if(u.verified === true){
    box.innerHTML = head("🗺️ State groups") + '<div class="sg-msg"><span class="big">✅</span>You’re verified.<br>You’re in the <b>' + S(u.verifiedState || u.state || "") + '</b> and <b>' + S(u.lga || "your LGA") + '</b> groups — find them in Messages.</div>';
    return;
  }
  if(SENT || (VS && VS.status === "pending")){
    const st = (VS && VS.state) || u.state || "your";
    box.innerHTML = head("🗺️ Request sent") + '<div class="sg-msg"><span class="big">⏳</span><b>Request sent to join the ' + S(st) + ' group</b><br>Your ' + S(st) + ' rep will check your document and approve it. You’ll be added automatically — you don’t need to do anything else.</div>' +
      (VS && VS.lga ? '<div class="sg-sub" style="text-align:center">' + S(VS.lga) + ' LGA · ' + S((PROOFS[VS.proof] || {}).label || "") + '</div>' : "");
    return;
  }
  const rejected = VS && VS.status === "rejected";
  const stOpts = STATE_LIST();
  const st = u.state || "";
  box.innerHTML = head("🗺️ Join your state &amp; LGA groups") +
    '<div class="sg-sub">Only verified students and alumni can join. ' + (rejected ? '<b style="color:#ff6b81">Last request: ' + S(VS.reason || "not approved") + '.</b> ' : "") + 'Your state rep checks your document and approves it. Until then you won’t be added.</div>' +
    '<span class="sg-l">You are</span><div class="sg-ro">' + S(u.role) + '</div>' +
    '<span class="sg-l">State of origin</span>' + (st ? '<div class="sg-ro">' + S(st) + '</div>' : '<select id="sg-state"><option value="">Choose your state</option>' + stOpts.map(s => '<option>' + S(s) + '</option>').join("") + '</select>') +
    '<span class="sg-l">Local government (LGA)</span><select id="sg-lga"></select><input type="text" id="sg-lga-x" placeholder="Type your LGA" style="display:none;margin-top:8px">' +
    '<span class="sg-l">School</span><input type="text" id="sg-inst" value="' + S(u.inst || "") + '" placeholder="Your university / institution">' +
    '<span class="sg-l">Document to upload</span><div class="sg-chips" id="sg-proof">' +
      Object.keys(PROOFS).map(k => '<button type="button" data-proof="' + k + '" class="' + (PROOF === k ? "on" : "") + '"><span>' + PROOFS[k].icon + '</span>' + PROOFS[k].label + '</button>').join("") + '</div>' +
    '<span class="sg-l">Name on the document</span><input type="text" id="sg-dname" value="' + S(u.name || "") + '" placeholder="Full name as written on it">' +
    '<span class="sg-l">Photo of the document</span><div class="sg-photo"><button type="button" class="sg-btn" id="sg-cam">📷 Take photo</button><button type="button" class="sg-btn" id="sg-pick">🖼 Choose photo</button></div>' +
    '<input type="file" id="sg-f1" accept="image/*" capture="environment" hidden><input type="file" id="sg-f2" accept="image/*" hidden>' +
    '<div class="sg-prev" id="sg-prev"><img alt=""></div>' +
    '<label class="sg-ck"><input type="checkbox" id="sg-ok"><span>This is my own document. Only my state rep can see it, and it is deleted after they decide.</span></label>' +
    '<div class="sg-err" id="sg-err"></div><button type="button" class="sg-pri" id="sg-send" disabled>Send request</button>';
  fillLga(st);
  if(IMG){ const p = $("sg-prev"); p.style.display = "block"; p.querySelector("img").src = IMG; }
  checkReady();
}
function fillLga(st){
  const sel = $("sg-lga"); if(!sel) return;
  const list = lgaList(st);
  sel.innerHTML = '<option value="">' + (st ? "Choose your LGA" : "Choose a state first") + '</option>' + list.map(l => '<option>' + S(l) + '</option>').join("") + (st ? '<option value="__other">My LGA isn’t listed</option>' : "");
  const x = $("sg-lga-x"); if(x) x.style.display = "none";
}
function readForm(){
  const u = me() || {};
  const st = u.state || ($("sg-state") || {}).value || "";
  let lga = ($("sg-lga") || {}).value || ""; if(lga === "__other") lga = (($("sg-lga-x") || {}).value || "").trim().replace(/\s+(lga|local government( area)?)$/i, "");
  return { state: st, lga, inst: (($("sg-inst") || {}).value || "").trim(), dname: (($("sg-dname") || {}).value || "").trim(), ok: !!($("sg-ok") || {}).checked };
}
function checkReady(){
  const b = $("sg-send"); if(!b) return;
  const f = readForm();
  b.disabled = BUSY || !(f.state && f.lga.length >= 3 && f.inst && f.dname && PROOF && IMG && f.ok);
}
function onSheetChange(e){
  const t = e.target;
  if(t.id === "sg-state"){ fillLga(t.value); }
  if(t.id === "sg-lga"){ const x = $("sg-lga-x"); if(x){ x.style.display = t.value === "__other" ? "block" : "none"; if(t.value === "__other") x.focus(); } }
  if(t.id === "sg-f1" || t.id === "sg-f2"){ const f = t.files && t.files[0]; if(f) shrink(f).then(d => { IMG = d; const p = $("sg-prev"); if(p){ p.style.display = "block"; p.querySelector("img").src = d; } checkReady(); }).catch(() => { const er = $("sg-err"); if(er) er.textContent = "Couldn’t read that photo. Try another one."; }); }
  checkReady();
}
async function onSheetClick(e){
  const o = $("sg-ov");
  if(e.target === o || e.target.closest("[data-x]")){ closeSheet(); return; }
  const p = e.target.closest("[data-proof]"); if(p){ PROOF = p.dataset.proof; document.querySelectorAll("#sg-proof button").forEach(b => b.classList.toggle("on", b === p)); checkReady(); return; }
  if(e.target.closest("#sg-cam")){ $("sg-f1").click(); return; }
  if(e.target.closest("#sg-pick")){ $("sg-f2").click(); return; }
  if(e.target.closest("#sg-send")){ await submit(); return; }
}
document.addEventListener("input", e => { if(SG_OPEN && e.target.closest && e.target.closest("#sg-sheet")) checkReady(); });

function shrink(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      let max = 1200, q = .72;
      const go = () => {
        const sc = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", q);
        if(d.length > 700000 && q > .4){ q -= .12; max = Math.max(800, max - 150); return go(); }
        URL.revokeObjectURL(url); res(d);
      };
      go();
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad")); };
    im.src = url;
  });
}

async function submit(){
  const u = me(), d = dbx(), er = $("sg-err"), btn = $("sg-send"); if(!u || !d || BUSY) return;
  const f = readForm(); if(!IMG) return;
  if(navigator.onLine === false){ er.textContent = "You’re offline. Connect to send your request."; return; }
  BUSY = true; btn.disabled = true; btn.textContent = "Sending…"; er.textContent = "";
  try{
    const meta = { uid: u.uid, name: u.name || "", email: u.email || "", role: u.role, inst: f.inst, state: f.state, lga: f.lga, proof: PROOF, docName: f.dname,
                   status: "pending", hasImage: true, ai: null, createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
    const b = d.batch();
    b.set(d.collection("verifications").doc(u.uid), meta);
    b.set(d.collection("verificationImages").doc(u.uid), { uid: u.uid, state: f.state, image: IMG, createdAt: FV().serverTimestamp() });
    await b.commit();
    if(!u.state){ try{ await d.collection("users").doc(u.uid).update({ state: f.state }); u.state = f.state; }catch(x){} }
    SENT = true; renderSheet(); repaintCard();
    runAI(IMG, { role: u.role, name: f.dname, school: f.inst, proof: PROOF }).then(ai => { if(ai) d.collection("verifications").doc(u.uid).update({ ai, aiAt: FV().serverTimestamp() }).catch(() => {}); });
  }catch(e){
    console.log("verification submit:", e);
    er.textContent = e && e.code === "permission-denied" ? "Verification isn’t switched on yet (the app’s Firestore rules need adding)." : "Couldn’t send. Please try again.";
    btn.textContent = "Send request";
  }finally{ BUSY = false; checkReady(); }
}
async function runAI(image, info){
  try{
    const a = authx(); if(!a || !a.currentUser) return null;
    const token = await a.currentUser.getIdToken();
    const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(Object.assign({ image }, info)) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ai ? j.ai : null;
  }catch(e){ return null; }
}
window.crStateGroups = openSheet;

/* ═════════ state reps / admins: review requests ═════════ */
let REP = { admin: false, states: [] };
const isRep = () => REP.admin || REP.states.length > 0;
async function loadRep(){
  const u = me(), d = dbx(); REP = { admin: false, states: [] }; if(!u || !d) return;
  try{ const a = await d.collection("admins").doc(u.uid).get(); REP.admin = a.exists; }catch(e){}
  try{ const r = await d.collection("stateReps").doc(u.uid).get(); if(r.exists) REP.states = Array.isArray(r.data().states) ? r.data().states : []; }catch(e){}
}
async function fetchPending(){
  const d = dbx(), out = new Map(), add = s => s.forEach(x => out.set(x.id, Object.assign({ id: x.id }, x.data())));
  if(REP.admin) add(await d.collection("verifications").where("status", "==", "pending").limit(100).get());
  else for(const st of REP.states) add(await d.collection("verifications").where("state", "==", st).where("status", "==", "pending").limit(50).get());
  return [...out.values()].sort((a, b) => ((a.createdAt && a.createdAt.seconds) || 0) - ((b.createdAt && b.createdAt.seconds) || 0));
}
let RV = { list: [], filter: "All", view: "list", err: "" };
function ensureReview(){
  if($("sg-rv")) return;
  const o = document.createElement("div"); o.className = "sg-ov"; o.id = "sg-rv";
  o.innerHTML = '<div class="sg-sheet" id="sg-rvbox"></div>';
  document.body.appendChild(o);
  o.addEventListener("click", onReviewClick);
  const v = document.createElement("div"); v.className = "sg-img"; v.id = "sg-imgv"; v.innerHTML = '<button type="button" aria-label="Close">✕</button><img alt="">';
  v.addEventListener("click", () => v.classList.remove("open")); document.body.appendChild(v);
}
async function openReview(){
  ensureReview(); $("sg-rv").classList.add("open"); RV.view = "list"; RV.filter = "All"; RV.err = "";
  $("sg-rvbox").innerHTML = head("🛡 Verify requests") + '<div class="sg-msg">Loading…</div>';
  try{ RV.list = await fetchPending(); }catch(e){ RV.list = []; RV.err = e && e.code === "permission-denied" ? "Reps need the Firestore rules added first (see firestore-rules-state-groups.txt)." : "Couldn’t load requests."; }
  paintReview(); updateBadge(RV.list.length);
}
function aiChip(r){
  const a = r.ai; if(!a) return '<div class="sg-ai">🤖 AI check not available — review the document yourself.</div>';
  const cls = a.verdict === "likely_valid" ? "good" : a.verdict === "likely_invalid" ? "bad" : "warn";
  const head = a.verdict === "likely_valid" ? "✅ AI: looks valid" : a.verdict === "likely_invalid" ? "❌ AI: doesn’t look valid" : "⚠️ AI: unclear";
  const bits = [];
  if(a.nameMatches === "no") bits.push("name doesn’t match"); else if(a.nameMatches === "yes") bits.push("name matches");
  if(a.schoolMatches === "no") bits.push("school doesn’t match");
  if(a.looksEdited) bits.push("may be edited");
  (a.concerns || []).slice(0, 2).forEach(c => bits.push(c));
  return '<div class="sg-ai ' + cls + '"><b>' + head + '</b>' + (a.summary ? ' — ' + S(a.summary) : '') + (bits.length ? '<br><small style="margin:0;color:inherit;opacity:.85">' + S(bits.join(" · ")) + '</small>' : '') + '<br><small style="margin:2px 0 0;color:inherit;opacity:.7">Pre-check only — you decide.</small></div>';
}
function paintReview(){
  const box = $("sg-rvbox"); if(!box) return;
  if(RV.view === "reps"){ return paintReps(); }
  const states = REP.admin ? [...new Set(RV.list.map(r => r.state))].sort() : REP.states;
  const shown = RV.list.filter(r => RV.filter === "All" || r.state === RV.filter);
  box.innerHTML = head("🛡 Verify requests") +
    '<div class="sg-sub">' + (REP.admin ? "You can review every state." : "You review: <b>" + S(REP.states.join(", ")) + "</b>.") + ' ' + RV.list.length + ' waiting.' + (REP.admin ? ' <a href="#" data-reps="1" style="color:var(--plight);font-weight:800">👥 Manage reps</a>' : '') + '</div>' +
    (states.length > 1 ? '<div class="sg-sts"><button type="button" data-f="All" class="' + (RV.filter === "All" ? "on" : "") + '">All</button>' + states.map(s => '<button type="button" data-f="' + S(s) + '" class="' + (RV.filter === s ? "on" : "") + '">' + S(s) + '</button>').join("") + '</div>' : "") +
    (RV.err ? '<div class="sg-msg">' + S(RV.err) + '</div>' : "") +
    (!RV.err && !shown.length ? '<div class="sg-msg"><span class="big">🎉</span>No requests waiting.</div>' : "") +
    shown.map(r =>
      '<div class="sg-req" data-id="' + S(r.id) + '"><div class="sg-rh"><b>' + S(r.name || "User") + '</b><span class="sg-tag">' + S(r.role) + '</span></div>' +
      '<small>' + S(r.inst) + ' · ' + S(r.state) + ' › ' + S(r.lga) + ' · ' + ago(r.createdAt) + '</small>' +
      '<small>' + ((PROOFS[r.proof] || {}).icon || "📄") + ' ' + S((PROOFS[r.proof] || {}).label || "Document") + ' · name on it: <b>' + S(r.docName) + '</b></small>' + aiChip(r) +
      '<div class="sg-acts"><button type="button" class="sg-btn" data-act="view">👁 View document</button><button type="button" class="sg-btn" data-act="ai">🤖 Re-check</button></div>' +
      '<div class="sg-acts"><button type="button" class="sg-btn ok" data-act="ok">✅ Approve</button><button type="button" class="sg-btn no" data-act="no">❌ Reject</button></div></div>').join("");
}
async function getImage(id){
  const s = await dbx().collection("verificationImages").doc(id).get();
  if(!s.exists) throw new Error("The photo is no longer available.");
  return s.data().image;
}
const REASONS = ["Blurry / unreadable", "Not a valid document", "Name doesn’t match", "Wrong state or LGA", "Other"];
async function decide(r, ok, reason){
  const d = dbx(), u = me(), F = FV(), b = d.batch();
  const base = { reviewedBy: u.uid, reviewerName: u.name || "", reviewedAt: F.serverTimestamp(), hasImage: false };
  b.update(d.collection("verifications").doc(r.id), ok ? Object.assign({ status: "approved" }, base) : Object.assign({ status: "rejected", reason: reason || "Not approved" }, base));
  if(ok) b.update(d.collection("users").doc(r.id), { verified: true, verifiedType: r.role, verifiedState: r.state, lga: r.lga, verifiedAt: F.serverTimestamp(), verifiedBy: u.uid });
  await b.commit();
  try{ await d.collection("verificationImages").doc(r.id).delete(); }catch(e){}
}
async function onReviewClick(e){
  const o = $("sg-rv");
  if(e.target === o || e.target.closest("[data-x]")){ o.classList.remove("open"); return; }
  const f = e.target.closest("[data-f]"); if(f){ RV.filter = f.dataset.f; paintReview(); return; }
  if(e.target.closest("[data-reps]")){ e.preventDefault(); RV.view = "reps"; paintReview(); return; }
  if(e.target.closest("[data-back]")){ RV.view = "list"; paintReview(); return; }
  if(RV.view === "reps") return repsClick(e);
  const card = e.target.closest(".sg-req"), btn = e.target.closest("[data-act]"); if(!card || !btn) return;
  const r = RV.list.find(x => x.id === card.dataset.id); if(!r) return;
  const act = btn.dataset.act;
  try{
    if(act === "view"){ btn.disabled = true; const img = await getImage(r.id); const v = $("sg-imgv"); v.querySelector("img").src = img; v.classList.add("open"); btn.disabled = false; }
    else if(act === "ai"){
      btn.disabled = true; btn.textContent = "Checking…";
      const ai = await runAI(await getImage(r.id), { role: r.role, name: r.docName, school: r.inst, proof: r.proof });
      if(ai){ r.ai = ai; try{ await dbx().collection("verifications").doc(r.id).update({ ai, aiAt: FV().serverTimestamp() }); }catch(x){} paintReview(); } else { btn.disabled = false; btn.textContent = "🤖 Re-check"; toast("The AI check couldn’t run."); }
    }
    else if(act === "ok"){
      if(!confirm("Approve " + (r.name || "this person") + " for " + r.state + " › " + r.lga + "?")) return;
      btn.disabled = true; await decide(r, true); RV.list = RV.list.filter(x => x.id !== r.id); paintReview(); updateBadge(RV.list.length); toast("✅ Approved");
    }
    else if(act === "no"){
      card.querySelector(".sg-acts:last-child").outerHTML = '<div class="sg-reasons">' + REASONS.map(x => '<button type="button" data-reason="' + S(x) + '">' + S(x) + '</button>').join("") + '</div><div class="sg-acts"><button type="button" class="sg-btn no" data-act="rej" disabled>Send rejection</button></div>';
    }
    else if(act === "rej"){
      const on = card.querySelector(".sg-reasons .on"); if(!on) return;
      btn.disabled = true; await decide(r, false, on.dataset.reason); RV.list = RV.list.filter(x => x.id !== r.id); paintReview(); updateBadge(RV.list.length); toast("Request rejected");
    }
  }catch(err){ console.log("review action:", err); toast(err && err.code === "permission-denied" ? "Not allowed — check the Firestore rules." : "Something went wrong. Try again."); btn.disabled = false; }
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#sg-rvbox .sg-reasons button"); if(!b) return;
  b.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  const send = b.parentNode.nextElementSibling && b.parentNode.nextElementSibling.querySelector("[data-act=rej]"); if(send) send.disabled = false;
});

/* ── admins: add / remove state reps ── */
let REPS = [], PICK = new Set();
async function paintReps(){
  const box = $("sg-rvbox");
  box.innerHTML = head("👥 State reps") + '<div class="sg-sub"><a href="#" data-back="1" style="color:var(--plight);font-weight:800">‹ Back to requests</a><br>A rep can approve people from the states you give them. Their account must already exist.</div>' +
    '<span class="sg-l">Add a rep</span><input type="text" id="sg-repmail" placeholder="Their CampusRoom email"><div class="sg-sts" id="sg-repsts">' +
    STATE_LIST().map(s => '<button type="button" data-st="' + S(s) + '" class="' + (PICK.has(s) ? "on" : "") + '">' + S(s) + '</button>').join("") + '</div>' +
    '<button type="button" class="sg-pri" id="sg-repadd" style="margin-top:8px">Add rep</button><div class="sg-err" id="sg-reperr"></div>' +
    '<span class="sg-l">Current reps</span><div id="sg-replist"><div class="sg-msg">Loading…</div></div>';
  try{
    const s = await dbx().collection("stateReps").get(); REPS = s.docs.map(x => Object.assign({ id: x.id }, x.data()));
    $("sg-replist").innerHTML = REPS.length ? REPS.map(r => '<div class="sg-rep" data-rid="' + S(r.id) + '"><div><b>' + S(r.name || r.email || r.id) + '</b><small>' + S((r.states || []).join(", ")) + '</small></div><button type="button" class="sg-btn no" data-rm="1" style="flex:0 0 auto">Remove</button></div>').join("") : '<div class="sg-msg">No reps yet.</div>';
  }catch(e){ $("sg-replist").innerHTML = '<div class="sg-msg">Couldn’t load reps.</div>'; }
}
async function repsClick(e){
  const st = e.target.closest("[data-st]"); if(st){ const s = st.dataset.st; if(PICK.has(s)) PICK.delete(s); else PICK.add(s); st.classList.toggle("on"); return; }
  const er = $("sg-reperr");
  if(e.target.closest("#sg-repadd")){
    const email = (($("sg-repmail") || {}).value || "").trim().toLowerCase(), states = [...PICK];
    if(!email || !states.length){ er.textContent = "Enter their email and pick at least one state."; return; }
    try{
      const d = dbx(); let snap = await d.collection("users").where("emailLower", "==", email).limit(1).get();
      if(snap.empty) snap = await d.collection("users").where("email", "==", email).limit(1).get();
      if(snap.empty){ er.textContent = "No CampusRoom account with that email."; return; }
      const doc = snap.docs[0];
      await d.collection("stateReps").doc(doc.id).set({ states, name: doc.data().name || "", email, addedBy: me().uid, addedAt: FV().serverTimestamp() });
      PICK = new Set(); toast("✅ Rep added"); paintReps();
    }catch(x){ er.textContent = x && x.code === "permission-denied" ? "Only admins can add reps (check the Firestore rules)." : "Couldn’t add the rep."; }
    return;
  }
  const rm = e.target.closest("[data-rm]");
  if(rm){ const id = rm.closest("[data-rid]").dataset.rid; if(!confirm("Remove this rep?")) return; try{ await dbx().collection("stateReps").doc(id).delete(); toast("Rep removed"); paintReps(); }catch(x){ toast("Couldn’t remove."); } }
}

/* ── Settings tiles ── */
function setTile(id, ic, label, fn){
  const g = document.querySelector("#tab-settings .cs-grid"); if(!g) return null;
  let b = $(id);
  if(!b){ b = document.createElement("button"); b.type = "button"; b.className = "cs-tile"; b.id = id; b.innerHTML = '<span class="t-ic">' + ic + '</span><span class="t-lb"></span>'; b.addEventListener("click", e => { e.stopPropagation(); fn(); }); g.insertBefore(b, g.children[3] || null); }
  const lb = b.querySelector(".t-lb"); if(lb.textContent !== label) lb.textContent = label; return b;
}
function addTiles(){
  const u = me(); if(!u) return;
  if(eligible(u)) setTile("sg-tile", "🗺️", u.verified ? "State Groups ✓" : "State Groups", openSheet);
  if(isRep()) setTile("sg-tile-rv", "🛡", PENDING_N ? "Verify Requests (" + PENDING_N + ")" : "Verify Requests", openReview);
}
let PENDING_N = 0;
function updateBadge(n){ PENDING_N = n; const t = $("sg-tile-rv"); if(!t) return; const lb = t.querySelector(".t-lb"), txt = n ? "Verify Requests (" + n + ")" : "Verify Requests"; if(lb.textContent !== txt) lb.textContent = txt; }
(function(){ const st = $("tab-settings"); if(st) new MutationObserver(() => { try{ addTiles(); }catch(e){} }).observe(st, { childList: true, subtree: true }); })();

/* ───────── start / stop with the signed-in person ───────── */
async function init(){
  const u = me(); if(!u || !u.uid) return;
  listen();
  await loadRep();
  addTiles();
  if(isRep()){ try{ const l = await fetchPending(); RV.list = l; updateBadge(l.length); }catch(e){} }
}
if(typeof window.startApp === "function" && !window.startApp.__sg){
  const _s = window.startApp;
  const w = function(){ const r = _s.apply(this, arguments); setTimeout(init, 900); return r; };
  w.__sg = true; window.startApp = w;
}
if(typeof window.doLogout === "function" && !window.doLogout.__sg){
  const _l = window.doLogout;
  const w = function(){ stop(); REP = { admin: false, states: [] }; closeSheet(); const r = $("sg-rv"); if(r) r.classList.remove("open"); return _l.apply(this, arguments); };
  w.__sg = true; window.doLogout = w;
}
if(me() && me().uid) setTimeout(init, 900);
})();
