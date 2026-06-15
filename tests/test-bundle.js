/* Vérifie la version embarquée (dist/) telle qu'elle tourne dans l'app :
   - dist/index.html ne contient AUCUN script en ligne ni gestionnaire on=
     en ligne (sinon bloqués par la CSP de bureau) ;
   - le code (dist/app.js) démarre : storageRead/DB/App définis, menus
     remplis, tableau de bord affiché ;
   - la DÉLÉGATION d'événements fonctionne : un vrai clic sur un bouton
     déclenche bien l'action (c'est le mécanisme qui remplace onclick). */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
execFileSync(process.execPath, [path.join(root, "scripts", "bundle.js")], { stdio: "ignore" });

const htmlRaw = fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
const jsFile  = fs.readdirSync(path.join(root, "dist")).find(f => /^app-.*\.js$/.test(f));
const appJs   = fs.readFileSync(path.join(root, "dist", jsFile), "utf8");
const report = [];
const check = (n, ok, d) => report.push((ok?"✔ ":"✘ ")+n+(d?" — "+d:""));

// Garde-fous CSP sur le HTML livré
check("Aucun gestionnaire on= en ligne dans index.html", !/\son[a-z]+=/i.test(htmlRaw));
check("Script externe versionné, sans query string", /<script src="app-[0-9.]+\.js"><\/script>/.test(htmlRaw) && !/src="[^"]*\?/.test(htmlRaw));

// On charge le HTML puis on injecte le bundle comme le ferait le navigateur
const html = htmlRaw.replace(/<script src="app-[^"]*"><\/script>/, "");
const errors = [];
const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window){
    Object.defineProperty(window, "crypto", { value: require("crypto").webcrypto });
    window.addEventListener("error", e => errors.push(e.message));
  },
});
const { window } = dom;
const s = window.document.createElement("script");
s.textContent = appJs;
window.document.body.appendChild(s);
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
window.dispatchEvent(new window.Event("DOMContentLoaded"));

setTimeout(() => {
  const doc = window.document, get = id => doc.getElementById(id);
  check("Aucune erreur JS au démarrage", errors.length === 0, errors.join(" | "));
  check("storageRead défini", window.eval("typeof storageRead")==="function");
  check("DB défini", window.eval("typeof DB")!=="undefined");
  check("Menu Catégories rempli", (get("sAccount")?get("sAccount").options.length:0) > 10);
  check("Tableau de bord affiché", (get("kpis")?get("kpis").innerHTML.trim().length:0) > 0);

  // DÉLÉGATION : un vrai clic sur l'onglet « Encoder » doit l'activer
  const clic = el => el.dispatchEvent(new window.MouseEvent("click", {bubbles:true}));
  const tabEncode = doc.querySelector('[data-act="showTab"][data-arg="encode"]');
  clic(tabEncode);
  check("Clic délégué : onglet Encoder activé", get("tab-encode").classList.contains("active"));

  // DÉLÉGATION : clic sur « Compte de résultats » génère le rapport
  const btnCR = doc.querySelector('[data-act="report"][data-arg="cr"]');
  clic(btnCR);
  check("Clic délégué : rapport généré", get("reportContent").innerHTML.includes("COMPTE DE RESULTATS"));

  console.log(report.join("\n"));
  const failed = report.filter(r=>r.startsWith("✘")).length;
  console.log("\n" + (failed===0 ? "BUNDLE + DÉLÉGATION OK" : failed+" ÉCHEC(S)"));
  process.exit(failed===0?0:1);
}, 1500);
