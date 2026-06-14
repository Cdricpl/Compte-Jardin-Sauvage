/* Vérifie que le fichier AUTONOME dist/index.html (celui réellement embarqué
   dans l'application de bureau) démarre tout seul : scripts intégrés, menus
   remplis, tableau de bord affiché, encodage fonctionnel. Régénère d'abord
   le bundle pour tester l'état courant des sources. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
execFileSync(process.execPath, [path.join(root, "scripts", "bundle.js")], { stdio: "ignore" });

const html = fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
const report = [];
const check = (n, ok, d) => report.push((ok?"✔ ":"✘ ")+n+(d?" — "+d:""));

// 0) Aucune référence externe : tout doit être en ligne
check("dist/index.html sans <script src> externe", !/<script src=/.test(html));

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
// jsdom n'exécute pas <script> inline au parse si runScripts mais sans resources ?
// Avec runScripts:"dangerously", les scripts inline SONT exécutés.
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
window.dispatchEvent(new window.Event("DOMContentLoaded"));

setTimeout(() => {
  const get = id => window.document.getElementById(id);
  check("Aucune erreur JS au démarrage", errors.length === 0, errors.join(" | "));
  check("storageRead défini (script intégré chargé)", window.eval("typeof storageRead")==="function");
  check("DB défini", window.eval("typeof DB")!=="undefined");
  check("App défini", window.eval("typeof App")==="object");
  check("Menu Catégories rempli", (get("sAccount")?get("sAccount").options.length:0) > 10,
        (get("sAccount")?get("sAccount").options.length:0)+" options");
  check("Tableau de bord affiché", (get("kpis")?get("kpis").innerHTML.trim().length:0) > 0);
  // encodage de bout en bout
  try{
    const App = window.eval("App");
    get("sType").value="dep"; App.fillSimpleAccounts();
    get("sDate").value="2026-06-14"; get("sAmount").value="42.00";
    App.saveSimple();
    check("Encodage opération simple", window.eval("DB").entries.length===1);
  }catch(e){ check("Encodage opération simple", false, e.message); }

  console.log(report.join("\n"));
  const failed = report.filter(r=>r.startsWith("✘")).length;
  console.log("\n" + (failed===0 ? "BUNDLE AUTONOME OK" : failed+" ÉCHEC(S)"));
  process.exit(failed===0?0:1);
}, 1500);
