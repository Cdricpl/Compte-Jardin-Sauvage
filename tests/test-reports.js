/* Vérifie la cohérence des rapports comptables sur la VRAIE logique :
   1) le bilan est toujours équilibré (ACTIF = PASSIF), y compris pour des
      comptes hors plan par défaut (classes 1-5 « exotiques ») ;
   2) le résultat affiché par le compte de résultats == resultOfYear (le
      résultat repris au bilan), y compris pour des comptes 6/7 ajoutés.
   Charge le VRAI index.html livré (code intégré en ligne). */
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const appDir = path.join(__dirname, "..", "app");
const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");

// Charger index.html SANS déclencher DOMContentLoaded : les blocs inline
// définissent toutes les fonctions, sans lancer le démarrage de l'app.
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  beforeParse(window){
    const { webcrypto } = require("crypto");
    Object.defineProperty(window, "crypto", { value: webcrypto });
  },
});
const { window } = dom;

const htmlBilan = window.eval("(b)=>Reports.htmlBilan(b)");
const htmlCR    = window.eval("(b)=>Reports.htmlCR(b)");
const resultOf  = window.eval("(b)=>resultOfYear(b)");
const balances  = window.eval("(y)=>balances(y)");

const E = lines => ({ id: Math.random()+"", journal:"ODV", piece:"x", date:"2026-03-01", comment:"", lines });
const report = [];
const check = (name, ok, detail) => report.push((ok?"✔ ":"✘ ")+name+(detail?" — "+detail:""));

function setup(accounts, entries){
  // Réassigne les liaisons lexicales DB / curYear définies dans les blocs inline.
  window.eval("curYear=2026");
  window.eval("DB=" + JSON.stringify({ settings:{name:"T",addr1:"",addr2:"",vat:"",signer:""}, accounts, entries }));
  return balances(2026);
}

// 1) Comptes exotiques classes 1-5 et 6/7
const accts = [["100000","P"],["140000","R"],["180000","DetteLT"],["493000","ProdReporter"],
  ["499000","Attente"],["550000","Banque"],["220000","Terrain"],["340000","Stock"],
  ["710000","Production stockée"],["720000","Production immo"],["770000","Produit except"],
  ["670000","Impôts"],["680000","Dotation except"],["690000","Affectation"],
  ["700000","Recette"],["600000","Achat"]].map(([code,label])=>({code,label}));
const entries = [
  E([{account:"550000",debit:1000,credit:0},{account:"100000",debit:0,credit:1000}]),
  E([{account:"220000",debit:5000,credit:0},{account:"180000",debit:0,credit:5000}]),
  E([{account:"340000",debit:300,credit:0},{account:"493000",debit:0,credit:300}]),
  E([{account:"499000",debit:120,credit:0},{account:"700000",debit:0,credit:120}]),
  E([{account:"600000",debit:80,credit:0},{account:"550000",debit:0,credit:80}]),
  E([{account:"550000",debit:50,credit:0},{account:"710000",debit:0,credit:50}]),
  E([{account:"550000",debit:60,credit:0},{account:"720000",debit:0,credit:60}]),
  E([{account:"550000",debit:70,credit:0},{account:"770000",debit:0,credit:70}]),
  E([{account:"670000",debit:30,credit:0},{account:"550000",debit:0,credit:30}]),
  E([{account:"680000",debit:40,credit:0},{account:"550000",debit:0,credit:40}]),
  E([{account:"690000",debit:25,credit:0},{account:"550000",debit:0,credit:25}]),
];
let bal = setup(accts, entries);
check("Bilan équilibré avec comptes exotiques (1-5 et 6/7)", !htmlBilan(bal).includes("n'est pas équilibré"));
const res = resultOf(bal);
const m = htmlCR(bal).match(/EXERCICE A AFFECTER\s*:<\/td><td class="c1"><\/td><td class="c2"><\/td><td class="c3">([^<]+)</);
const shownRes = m ? parseFloat(m[1].replace(/\./g,"").replace(",",".")) : NaN;
check("Résultat du compte de résultats == résultat du bilan", Math.abs(shownRes-res)<0.005, `CR=${shownRes}, bilan=${res}`);

// 2) Plan par défaut : 300 jeux d'écritures aléatoires, toujours équilibré
const def = window.eval("DEFAULT_ACCOUNTS").map(([code,label])=>({code:String(code),label}));
let allBalanced = true, worst = "";
for(let t=0;t<300;t++){
  const e=[];
  for(let i=0;i<25;i++){
    const a=def[Math.floor(Math.random()*def.length)].code, b=def[Math.floor(Math.random()*def.length)].code;
    if(a!==b){ const v=Math.round(Math.random()*100000)/100; e.push(E([{account:a,debit:v,credit:0},{account:b,debit:0,credit:v}])); }
  }
  if(htmlBilan(setup(def,e)).includes("n'est pas équilibré")){ allBalanced=false; worst="essai "+t; break; }
}
check("Plan par défaut : 300 jeux aléatoires tous équilibrés", allBalanced, worst);

console.log(report.join("\n"));
const failed = report.filter(r=>r.startsWith("✘")).length;
console.log("\n" + (failed===0 ? "TOUS LES TESTS RAPPORTS PASSENT" : failed+" TEST(S) EN ÉCHEC"));
process.exit(failed===0?0:1);
