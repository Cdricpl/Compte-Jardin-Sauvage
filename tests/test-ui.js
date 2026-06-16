/* Test de démarrage de l'application dans un navigateur simulé (jsdom).
   Charge le VRAI index.html livré (tout le code est intégré en ligne) et
   vérifie : erreurs JS, remplissage des menus déroulants, tableau de bord. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const appDir = path.join(__dirname, "..", "app");
const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");

const errors = [];

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",   // exécute les scripts inline comme un navigateur
  pretendToBeVisual: true,
  beforeParse(window) {
    window.addEventListener("error", (e) => {
      errors.push("ERREUR JS : " + e.message + " @ " + (e.filename||"?") + ":" + (e.lineno||"?"));
    });
    window.addEventListener("unhandledrejection", (e) => {
      errors.push("PROMESSE REJETÉE : " + (e.reason && e.reason.message || e.reason));
    });
    const { webcrypto } = require("crypto");
    Object.defineProperty(window, "crypto", { value: webcrypto });
  },
});

const { window } = dom;

// Les scripts inline s'exécutent au parsing ; on déclenche DOMContentLoaded
// (le démarrage est idempotent : un éventuel double-événement est sans effet).
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
window.dispatchEvent(new window.Event("DOMContentLoaded"));

// Laisser le temps à l'init async de tourner
setTimeout(() => {
  const doc = window.document;
  const get = (id) => doc.getElementById(id);
  const report = [];

  const check = (name, cond, detail) =>
    report.push((cond ? "✔ " : "✘ ") + name + (detail ? " — " + detail : ""));

  // 1. Erreurs JS
  check("Aucune erreur JavaScript", errors.length === 0, errors.join(" | "));

  // 2. App définie (const au niveau script : accessible via eval, pas window.X)
  const App = window.eval("typeof App !== 'undefined' ? App : undefined");
  const DBref = () => window.eval("DB");
  check("Objet App défini", typeof App === "object");
  check("Objet Reports défini", window.eval("typeof Reports") === "object");
  check("DB chargée", DBref() && Array.isArray(DBref().accounts),
        DBref() ? DBref().accounts.length + " comptes" : "DB null");

  // 2b. Tous les blocs de code se sont chargés (marqueurs de démarrage)
  const loaded = window.eval("(window.__L||[]).join(',')");
  check("Bloc stockage exécuté", loaded.split(",").includes("storage"), loaded);

  // 3. Menus déroulants remplis
  const yearOpts = get("yearSelect") ? get("yearSelect").options.length : 0;
  check("Sélecteur d'exercice rempli", yearOpts > 0, yearOpts + " options");
  const sModeOpts = get("sMode") ? get("sMode").options.length : 0;
  check("Menu Banque/Caisse rempli", sModeOpts > 0, sModeOpts + " options");
  const sAccOpts = get("sAccount") ? get("sAccount").options.length : 0;
  check("Menu Catégories rempli", sAccOpts > 10, sAccOpts + " options");
  const eJournalOpts = get("eJournal") ? get("eJournal").options.length : 0;
  check("Menu Journal rempli", eJournalOpts === 4, eJournalOpts + " options");

  // 4. Tableau de bord
  const kpis = get("kpis") ? get("kpis").innerHTML.trim() : "";
  check("Tableau de bord (KPIs) affiché", kpis.length > 0, kpis.length + " caractères");
  const dash = get("dashLast") ? get("dashLast").innerHTML.trim() : "";
  check("Section dernières écritures affichée", dash.length > 0);

  // 4b. Panneau de diagnostic retiré au démarrage normal
  check("Écran de démarrage retiré", !get("bootDiag"));

  // 5. Encodage simple de bout en bout
  try {
    get("sType").value = "dep";
    App.fillSimpleAccounts();
    get("sDate").value = "2026-06-12";
    get("sAmount").value = "23.50";
    get("sComment").value = "Test goûters";
    App.saveSimple();
    check("Encodage opération simple", DBref().entries.length === 1,
          DBref().entries.length + " écriture(s)");
    const e = DBref().entries[0];
    const d = e ? e.lines.reduce((t,l)=>t+l.debit,0) : 0;
    const c = e ? e.lines.reduce((t,l)=>t+l.credit,0) : 0;
    check("Écriture équilibrée", d === c && d === 23.5, "débit " + d + " / crédit " + c);
  } catch (err) {
    check("Encodage opération simple", false, err.message);
  }

  // 6. Rapports
  try {
    App.report("annuels");
    const rc = get("reportContent").innerHTML;
    check("Rapport comptes annuels généré", rc.includes("COMPTE DE RESULTATS"), rc.length + " caractères");
  } catch (err) {
    check("Rapport comptes annuels généré", false, err.message);
  }

  console.log(report.join("\n"));
  const failed = report.filter(r => r.startsWith("✘")).length;
  console.log("\n" + (failed === 0 ? "TOUS LES TESTS PASSENT" : failed + " TEST(S) EN ÉCHEC"));
  process.exit(failed === 0 ? 0 : 1);
}, 2500);
