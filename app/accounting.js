"use strict";

/* ── Utilitaires numériques et affichage ── */
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

function fmt(n){
  return r2(n).toLocaleString("de-DE",{minimumFractionDigits:2, maximumFractionDigits:2});
}

function parseAmount(s){
  if(typeof s === "number") return s;
  if(!s) return 0;
  s = String(s).trim().replace(",", ".");
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function esc(s){
  return String(s??"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

function dFR(iso){
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function toast(msg, err){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "msg"+(err?" err":"");
  t.style.display = "block";
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.style.display="none", 3500);
}

/* ── Accès au plan comptable ── */
function accLabel(code){
  const a = DB.accounts.find(a=>a.code===code);
  return a ? a.label : code;
}

function accountsSorted(){
  return [...DB.accounts].sort((a,b)=>a.code.localeCompare(b.code));
}

/* ── Entrées et numérotation ── */
function entriesOfYear(y){
  return DB.entries
    .filter(e=>e.date && e.date.startsWith(String(y)))
    .sort((a,b)=> a.date===b.date
      ? (a.piece||"").localeCompare(b.piece||"")
      : a.date.localeCompare(b.date));
}

function nextPiece(journal, year){
  let max = 0;
  DB.entries.forEach(e=>{
    if(e.journal===journal && e.date && e.date.startsWith(String(year))){
      const n = parseInt((e.piece||"").slice(4), 10);
      if(!isNaN(n) && n>max) max = n;
    }
  });
  return String(year) + String(max+1).padStart(4,"0");
}

/* ── Soldes et calculs comptables ── */
function balances(year){
  const m = {};
  entriesOfYear(year).forEach(e=> e.lines.forEach(l=>{
    if(!m[l.account]) m[l.account] = {deb:0, cre:0};
    m[l.account].deb = r2(m[l.account].deb + (l.debit||0));
    m[l.account].cre = r2(m[l.account].cre + (l.credit||0));
  }));
  return m;
}

function solde(bal, code){
  const b = bal[code];
  return b ? r2(b.deb - b.cre) : 0;
}

function accountsIn(bal, pred){
  return accountsSorted()
    .filter(a=>pred(a.code))
    .map(a=>({...a, s: solde(bal,a.code), mv: !!bal[a.code]}));
}

function sum(arr, f){
  return r2(arr.reduce((t,x)=>r2(t+f(x)), 0));
}

function resultOfYear(bal){
  let res = 0;
  for(const code in bal){
    const c = code[0];
    if(c==="6") res = r2(res - (bal[code].deb - bal[code].cre));
    else if(c==="7") res = r2(res + (bal[code].cre - bal[code].deb));
  }
  return res;
}
