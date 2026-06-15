#!/usr/bin/env node
/* Génère dist/ : la version embarquée dans l'application de bureau.
     - dist/app-<version>.js : les 5 scripts concaténés en UN fichier externe
     - dist/index.html       : la page, référençant <script src="app-<version>.js">

   Points clés :
   - Script EXTERNE (la CSP de bureau, à nonce, bloque les scripts EN LIGNE).
   - PAS de « ?v= » : le résolveur d'assets de Tauri ne trouve pas un chemin
     contenant une query string ; on versionne donc le NOM DU FICHIER pour
     casser le cache sans casser la résolution.
   - Un seul fichier : pas de chargement partiel possible.

   Les fichiers source restent modulaires dans app/ (dev + tests). */
"use strict";
const fs = require("fs");
const path = require("path");

const root   = path.join(__dirname, "..");
const appDir = path.join(root, "app");
const outDir = path.join(root, "dist");

const ORDER = ["config.js", "storage.js", "accounting.js", "reports.js", "ui.js"];
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const jsName = `app-${version}.js`;

// Sonde précoce : dès que le fichier externe s'exécute, on le signale dans
// l'écran de démarrage. Si l'utilisateur voit ce texte, le script s'est bien
// chargé (le problème serait alors ailleurs) ; sinon, le script ne charge pas.
const probe = `try{var _b=document.getElementById('bootStep');if(_b)_b.textContent='Code chargé ✓ — initialisation…';}catch(e){}\n`;

const js = probe + ORDER.map(f =>
  `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(appDir, f), "utf8")
).join("\n");

let html = fs.readFileSync(path.join(appDir, "index.html"), "utf8")
  .replace(/__APP_VERSION__/g, version);

const blockRe = /<script src="config\.js"><\/script>[\s\S]*?<script src="ui\.js"><\/script>/;
if (!blockRe.test(html)) {
  console.error("bundle.js : bloc <script src> introuvable dans app/index.html");
  process.exit(1);
}
html = html.replace(blockRe, `<script src="${jsName}"></script>`);

fs.mkdirSync(outDir, { recursive: true });
// Nettoie les anciens app-*.js pour ne pas accumuler les versions
for (const f of fs.readdirSync(outDir)) {
  if (/^app(-.*)?\.js$/.test(f)) fs.unlinkSync(path.join(outDir, f));
}
fs.writeFileSync(path.join(outDir, jsName), js);
fs.writeFileSync(path.join(outDir, "index.html"), html);

// Garde-fous : aucun script en ligne, aucun gestionnaire on* en ligne, pas de query string.
if (/<script>(?![\s\S]*src=)/.test(html)) { console.error("bundle.js : script EN LIGNE détecté"); process.exit(1); }
const inlineHandlers = html.match(/\son[a-z]+=/gi) || [];
if (inlineHandlers.length) { console.error("bundle.js : gestionnaires en ligne :", inlineHandlers.join(",")); process.exit(1); }
if (/src="[^"]*\?/.test(html)) { console.error("bundle.js : query string dans un src (interdit)"); process.exit(1); }

console.log(`bundle.js : dist/${jsName} (${(js.length/1024).toFixed(0)} Ko) + dist/index.html, version ${version}`);
