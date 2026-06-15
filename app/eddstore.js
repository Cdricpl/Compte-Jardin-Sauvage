"use strict";
try{(window.__L=window.__L||[]).push("storage-start");}catch(e){}

/* ── Détection Tauri (desktop) vs navigateur ── */
/* Tout est protégé : aucune ligne de ce fichier ne doit pouvoir avorter son
   chargement (sinon DB/storageRead ne seraient pas définis et l'app planterait). */
let isTauri = false;
try {
  isTauri = typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined'
         && !!window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function';
} catch(e) { isTauri = false; }

/* Si l'IPC Tauri ne répond pas (timeout/erreur), on bascule sur localStorage
   pour que l'application démarre TOUJOURS, avec un avertissement visible. */
let tauriBroken = false;

function invokeT(cmd, args){
  return new Promise((resolve, reject)=>{
    const h = setTimeout(()=>reject(new Error("le stockage de l'application ne répond pas")), 3000);
    window.__TAURI__.core.invoke(cmd, args).then(
      v=>{ clearTimeout(h); resolve(v); },
      e=>{ clearTimeout(h); reject(e); });
  });
}

/* ── Abstraction stockage (Tauri : fichier système / navigateur : localStorage) ── */
async function storageRead(){
  if(isTauri && !tauriBroken){
    try{ return await invokeT('read_data'); }
    catch(e){ tauriBroken = true; console.error("Stockage fichier indisponible :", e); }
  }
  try{ return localStorage.getItem(STORE_KEY); }catch(e){ return null; }
}
async function storageWrite(raw){
  if(isTauri && !tauriBroken){
    try{ await invokeT('write_data', {data: raw}); return; }
    catch(e){ tauriBroken = true; console.error("Stockage fichier indisponible :", e); }
  }
  localStorage.setItem(STORE_KEY, raw);
}
async function snapshotsRead(){
  if(isTauri && !tauriBroken){
    try{ return await invokeT('read_snapshots'); }
    catch(e){ tauriBroken = true; }
  }
  try{ return localStorage.getItem(SNAP_KEY); }catch(e){ return null; }
}
async function snapshotsWrite(raw){
  if(isTauri && !tauriBroken){
    try{ await invokeT('write_snapshots', {data: raw}); return; }
    catch(e){ tauriBroken = true; }
  }
  localStorage.setItem(SNAP_KEY, raw);
}

/* ── IndexedDB minimal (mémoriser le handle de sauvegarde auto) ── */
function idbOpen(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open("edd-compta-fs", 1);
    r.onupgradeneeded = ()=>r.result.createObjectStore("kv");
    r.onsuccess = ()=>res(r.result);
    r.onerror = ()=>rej(r.error);
  });
}
async function idbGet(key){
  try{
    const db = await idbOpen();
    return await new Promise(res=>{
      const g = db.transaction("kv","readonly").objectStore("kv").get(key);
      g.onsuccess = ()=>res(g.result); g.onerror = ()=>res(null);
    });
  }catch(e){ return null; }
}
async function idbSet(key,val){
  try{
    const db = await idbOpen();
    await new Promise(res=>{
      const tx = db.transaction("kv","readwrite");
      tx.objectStore("kv").put(val,key);
      tx.oncomplete = res; tx.onerror = res;
    });
  }catch(e){}
}
async function idbDel(key){
  try{
    const db = await idbOpen();
    await new Promise(res=>{
      const tx = db.transaction("kv","readwrite");
      tx.objectStore("kv").delete(key);
      tx.oncomplete = res; tx.onerror = res;
    });
  }catch(e){}
}

/* ── État de la base de données ── */
let DB = null;
let curYear = 2026;
try { curYear = new Date().getFullYear(); } catch(e) {}

function defaultDB(){
  return {
    settings:{name:"EDD ASBL", addr1:"", addr2:"", vat:"", signer:""},
    accounts: DEFAULT_ACCOUNTS.map(([code,label])=>({code,label})),
    entries: []
  };
}

function loadPlain(obj){
  DB = obj || defaultDB();
  if(!DB.settings) DB.settings = defaultDB().settings;
  if(!DB.accounts) DB.accounts = defaultDB().accounts;
  if(!DB.entries)  DB.entries  = [];
}

/* ── Snapshots (filet de sécurité : 15 derniers états) ── */
async function pushSnapshot(raw){
  try{
    const existing = await snapshotsRead();
    const snaps = JSON.parse(existing||"[]");
    snaps.push({t:Date.now(), raw});
    while(snaps.length>15) snaps.shift();
    await snapshotsWrite(JSON.stringify(snaps));
  }catch(e){}
}

function stampSaved(){
  const el = document.getElementById("saveStamp");
  if(el) el.textContent = "💾 Enregistré à " +
    new Date().toLocaleTimeString("fr-BE",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

/* ── Sauvegarde principale (localStorage + snapshot + fichier auto) ── */
let _saving = Promise.resolve();
let autoHandle = null;

function save(){
  _saving = _saving.then(async ()=>{
    const raw = JSON.stringify(DB);
    await storageWrite(raw);
    await pushSnapshot(raw);
    stampSaved();
    if(!isTauri && autoHandle) await App.writeAutoFile();
  }).catch(e=>toast("Erreur d'enregistrement : "+e.message, true));
  return _saving;
}

/* marqueur de chargement (diagnostic) */
try{(window.__L=window.__L||[]).push("storage");}catch(e){}
