#!/usr/bin/env node
/* Génère dist/ : la version embarquée dans l'application de bureau.
     - dist/app.js     : les 5 scripts concaténés en UN fichier externe
     - dist/index.html : la page, référençant <script src="app.js?v=VERSION">

   Pourquoi externe (et non en ligne) : la Content-Security-Policy de
   l'application de bureau interdit les scripts EN LIGNE (inline). Un seul
   fichier .js EXTERNE est autorisé (script-src 'self'), évite tout
   chargement partiel (un seul fichier) et le « ?v= » force le
   rafraîchissement après mise à jour (pas de cache périmé).

   Les fichiers source restent modulaires dans app/ (dev + tests). */
"use strict";
const fs = require("fs");
const path = require("path");

const root   = path.join(__dirname, "..");
const appDir = path.join(root, "app");
const outDir = path.join(root, "dist");

const ORDER = ["config.js", "storage.js", "accounting.js", "reports.js", "ui.js"];
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

const js = ORDER.map(f =>
  `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(appDir, f), "utf8")
).join("\n");

let html = fs.readFileSync(path.join(appDir, "index.html"), "utf8")
  .replace(/__APP_VERSION__/g, version);

const blockRe = /<script src="config\.js"><\/script>[\s\S]*?<script src="ui\.js"><\/script>/;
if (!blockRe.test(html)) {
  console.error("bundle.js : bloc <script src> introuvable dans app/index.html");
  process.exit(1);
}
html = html.replace(blockRe, `<script src="app.js?v=${version}"></script>`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "app.js"), js);
fs.writeFileSync(path.join(outDir, "index.html"), html);

// Garde-fous : aucun script en ligne, aucun gestionnaire on* en ligne.
const inlineScript = /<script>(?![\s\S]*src=)/.test(html);
const inlineHandlers = (html.match(/\son[a-z]+=/gi) || []);
if (inlineScript) { console.error("bundle.js : script EN LIGNE détecté dans index.html"); process.exit(1); }
if (inlineHandlers.length) { console.error("bundle.js : gestionnaires en ligne détectés :", inlineHandlers.join(",")); process.exit(1); }

console.log(`bundle.js : dist/app.js (${(js.length/1024).toFixed(0)} Ko) + dist/index.html générés, version ${version}`);
