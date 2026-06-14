#!/usr/bin/env node
/* Génère dist/index.html : une version AUTONOME (un seul fichier) de
   l'application, où les 5 scripts (config, storage, accounting, reports, ui)
   sont intégrés en ligne dans la page.

   Pourquoi : en application de bureau, charger 5 fichiers .js séparés expose
   à des échecs partiels (un fichier non chargé / servi depuis un cache
   périmé par le WebView après une mise à jour → « storageRead is not
   defined »). Un fichier unique rend ce problème impossible : tout le code
   arrive avec la page, dans le même ordre et le même contexte.

   Les fichiers source restent modulaires dans app/ (dev + tests). */
"use strict";
const fs = require("fs");
const path = require("path");

const root   = path.join(__dirname, "..");
const appDir = path.join(root, "app");
const outDir = path.join(root, "dist");

const ORDER = ["config.js", "storage.js", "accounting.js", "reports.js", "ui.js"];

let html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");

// Concatène les 5 scripts ; neutralise toute éventuelle séquence </script>
// présente dans une chaîne/commentaire pour ne pas casser la balise inline.
const js = ORDER.map(f => {
  const code = fs.readFileSync(path.join(appDir, f), "utf8");
  return `/* ===== ${f} ===== */\n` + code;
}).join("\n").replace(/<\/script>/gi, "<\\/script>");

// Remplace le bloc des 5 balises <script src="..."></script> par un seul
// bloc <script> en ligne contenant tout le code.
const blockRe = /<script src="config\.js"><\/script>[\s\S]*?<script src="ui\.js"><\/script>/;
if (!blockRe.test(html)) {
  console.error("bundle.js : bloc <script src> introuvable dans app/index.html");
  process.exit(1);
}
html = html.replace(blockRe, `<script>\n${js}\n</script>`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);

// Vérification : plus aucune référence externe .js, et taille cohérente.
if (/<script src=/.test(html)) {
  console.error("bundle.js : il reste des <script src> externes !");
  process.exit(1);
}
console.log(`bundle.js : dist/index.html généré (${(html.length/1024).toFixed(0)} Ko, ${ORDER.length} scripts intégrés)`);
