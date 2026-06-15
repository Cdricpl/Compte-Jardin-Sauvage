/* Simule l'application de bureau (Tauri) avec 3 comportements d'IPC :
   - ok      : invoke répond normalement (null = première ouverture)
   - reject  : invoke échoue immédiatement
   - hang    : invoke ne répond JAMAIS (le bug « écran vide » rapporté)
   Dans les 3 cas, les menus et le tableau de bord doivent se remplir. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const appDir = path.join(__dirname, "..", "app");
const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8")
  .replace(/<script src="[^"]+"><\/script>\s*/g, "");

function boot(mode){
  return new Promise((done)=>{
    const dom = new JSDOM(html, {
      url: "http://localhost/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse(window){
        const { webcrypto } = require("crypto");
        Object.defineProperty(window, "crypto", { value: webcrypto });
        // Faux IPC Tauri
        window.__TAURI__ = { core: { invoke: (cmd, args) => {
          if(mode==="ok")     return Promise.resolve(null);
          if(mode==="reject") return Promise.reject(new Error("ACL: not allowed"));
          return new Promise(()=>{});   // hang : jamais résolu
        }}};
      },
    });
    const { window } = dom;
    for (const f of ["config.js","eddstore.js","accounting.js","reports.js","ui.js"]) {
      const s = window.document.createElement("script");
      s.textContent = fs.readFileSync(path.join(appDir, f), "utf8");
      window.document.body.appendChild(s);
    }
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", {bubbles:true}));
    window.dispatchEvent(new window.Event("DOMContentLoaded"));
    // hang : le timeout de secours est de 3 s → attendre 4 s
    setTimeout(()=>{
      const get = id => window.document.getElementById(id);
      done({
        mode,
        isTauri:   window.eval("isTauri"),
        broken:    window.eval("tauriBroken"),
        years:     get("yearSelect").options.length,
        accounts:  get("sAccount").options.length,
        kpis:      get("kpis").innerHTML.trim().length,
        notice:    get("notices").textContent.includes("stockage"),
      });
    }, mode==="hang" ? 4200 : 800);
  });
}

(async ()=>{
  let failed = 0;
  for(const mode of ["ok","reject","hang"]){
    const r = await boot(mode);
    const visible = r.years>0 && r.accounts>10 && r.kpis>0;
    const okBroken = mode==="ok" ? !r.broken : r.broken;
    const okNotice = mode==="ok" ? !r.notice : r.notice;
    const pass = visible && okBroken && okNotice;
    if(!pass) failed++;
    console.log(`${pass?"✔":"✘"} mode=${mode} → interface remplie:${visible}` +
      ` (années:${r.years}, comptes:${r.accounts}, kpis:${r.kpis} car.)` +
      ` | bascule secours:${r.broken} | avertissement:${r.notice}`);
  }
  console.log(failed===0 ? "\nTOUS LES SCÉNARIOS TAURI PASSENT" : `\n${failed} SCÉNARIO(S) EN ÉCHEC`);
  process.exit(failed===0?0:1);
})();
