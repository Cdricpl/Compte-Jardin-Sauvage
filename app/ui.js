"use strict";

const App = {

  /* ── Démarrage ── */
  async init(){
    let raw = null;
    const stored = await storageRead().catch(()=>null);
    if(stored){
      try{ raw = JSON.parse(stored); }
      catch(e){
        // Données illisibles : les préserver dans un instantané avant de
        // repartir à vide, pour qu'un futur save() n'écrase rien d'irrécupérable.
        await pushSnapshot(stored);
        showFatal("Les données enregistrées sont illisibles. Une copie a été conservée dans « Versions précédentes » ; restaurez une sauvegarde JSON si nécessaire.");
      }
    }
    if(raw && raw.__enc===1){
      hideBoot();
      this._encBlob = raw;
      document.getElementById("lockScreen").style.display = "flex";
      document.getElementById("lockPwd").focus();
      return;
    }
    loadPlain(raw);
    this.start();
  },

  async unlock(){
    const pwd   = document.getElementById("lockPwd").value;
    const errEl = document.getElementById("lockErr");
    if(!pwd){ errEl.textContent = "Entrez le mot de passe."; return; }
    if(!crypto.subtle){ errEl.textContent = "Chiffrement indisponible dans ce navigateur."; return; }
    try{
      const blob = this._encBlob;
      passSalt   = unb64(blob.salt);
      cryptoKey  = await deriveKey(pwd, passSalt);
      const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:unb64(blob.iv)}, cryptoKey, unb64(blob.data));
      loadPlain(JSON.parse(txtDec.decode(plain)));
      document.getElementById("lockScreen").style.display = "none";
      document.getElementById("lockPwd").value = "";
      errEl.textContent = "";
      this.start();
    }catch(e){
      cryptoKey = null; passSalt = null;
      errEl.textContent = "Mot de passe incorrect.";
    }
  },

  start(){
    hideBoot();
    this.refreshYears();
    this.fillSelectors();
    this.applySettingsToUI();
    this.resetEntryForm();
    this.resetSimpleForm();
    this.updatePwdStatus();
    this.renderAll();
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{}); }catch(e){}
    this.initAutoFile();
  },

  /* ── Sauvegarde automatique dans un fichier (File System Access API) ── */
  async initAutoFile(){
    if(isTauri){ this.updateAutoFileStatus(); return; }
    if(typeof indexedDB==="undefined" || !window.showSaveFilePicker){ this.updateAutoFileStatus(); return; }
    const h = await idbGet("autoFile");
    if(h){
      try{
        const p = await h.queryPermission({mode:"readwrite"});
        if(p==="granted"){ autoHandle = h; }
        else { this._pendingHandle = h; this._fsNeedsPerm = true; }
      }catch(e){}
    }
    this.updateAutoFileStatus();
    this.renderNotices();
  },

  async enableAutoFile(){
    if(!window.showSaveFilePicker)
      return toast("Votre navigateur ne permet pas la sauvegarde automatique dans un fichier. Utilisez Chrome ou Edge, ou faites des sauvegardes manuelles.", true);
    try{
      const name = "compta_auto_" + (DB.settings.name||"asbl").replace(/\s+/g,"_") + ".json";
      autoHandle = await window.showSaveFilePicker({
        suggestedName: name,
        types:[{description:"Sauvegarde comptabilité", accept:{"application/json":[".json"]}}]
      });
      await idbSet("autoFile", autoHandle);
      this._fsNeedsPerm = false; this._pendingHandle = null;
      await this.writeAutoFile();
      this.updateAutoFileStatus(); this.renderNotices();
      toast("Sauvegarde automatique activée : le fichier sera mis à jour à chaque modification ✔");
    }catch(e){}
  },

  async resumeAutoFile(){
    const h = this._pendingHandle; if(!h) return;
    try{
      const p = await h.requestPermission({mode:"readwrite"});
      if(p==="granted"){
        autoHandle = h; this._fsNeedsPerm = false; this._pendingHandle = null;
        await this.writeAutoFile();
        toast("Sauvegarde automatique réactivée ✔");
      }
    }catch(e){}
    this.updateAutoFileStatus(); this.renderNotices();
  },

  async disableAutoFile(){
    autoHandle = null; this._pendingHandle = null; this._fsNeedsPerm = false;
    await idbDel("autoFile");
    this.updateAutoFileStatus(); this.renderNotices();
    toast("Sauvegarde automatique désactivée.");
  },

  async writeAutoFile(){
    if(!autoHandle) return;
    try{
      const w = await autoHandle.createWritable();
      await w.write(JSON.stringify(DB, null, 1));
      await w.close();
      localStorage.setItem(EXPORT_KEY, String(Date.now()));
    }catch(e){
      autoHandle = null; this._fsNeedsPerm = true;
      this.updateAutoFileStatus(); this.renderNotices();
    }
  },

  updateAutoFileStatus(){
    const el     = document.getElementById("autoFileStatus");
    const onBtn  = document.getElementById("autoFileOnBtn");
    const offBtn = document.getElementById("autoFileOffBtn");
    if(isTauri){
      el.textContent = "✅ Application de bureau — les données sont enregistrées automatiquement dans un fichier de l'ordinateur.";
      onBtn.style.display = "none"; offBtn.style.display = "none";
      if(this._dataDir===undefined){
        this._dataDir = null;
        invokeT("get_data_dir").then(p=>{ this._dataDir = p; this.updateAutoFileStatus(); }).catch(()=>{});
      }
      if(this._dataDir)
        el.textContent = `✅ Application de bureau — les données sont enregistrées automatiquement dans : ${this._dataDir}`;
      return;
    }
    if(!window.showSaveFilePicker){
      el.textContent = "Non disponible dans ce navigateur (fonctionne avec Chrome et Edge). Utilisez la sauvegarde manuelle ci-dessous.";
      onBtn.style.display = "none"; offBtn.style.display = "none"; return;
    }
    if(autoHandle){
      el.textContent = `✅ Active — le fichier « ${autoHandle.name} » est mis à jour à chaque modification.`;
      onBtn.style.display = "none"; offBtn.style.display = "inline-block";
    } else if(this._fsNeedsPerm){
      el.textContent = "⏸ En attente de votre autorisation (bandeau jaune en haut de l'écran).";
      onBtn.style.display = "inline-block"; offBtn.style.display = "inline-block";
    } else {
      el.textContent = "Inactive. Choisissez un fichier sur votre ordinateur (ou une clé USB) : il sera mis à jour automatiquement à chaque modification.";
      onBtn.style.display = "inline-block"; offBtn.style.display = "none";
    }
  },

  renderNotices(){
    const parts = [];
    if(fatalMsg) parts.push(fatalHTML());
    if(tauriBroken)
      parts.push(`<div class="notice"><div class="grow">⚠ Le <b>stockage fichier de l'application</b> ne répond pas : les données sont enregistrées dans le stockage interne en attendant. Faites une <b>sauvegarde JSON</b> (Paramètres) par précaution.</div></div>`);
    if(!isTauri && this._fsNeedsPerm)
      parts.push(`<div class="notice"><div class="grow">📁 Pour des raisons de sécurité, le navigateur demande votre accord pour reprendre la <b>sauvegarde automatique</b> dans le fichier.</div>
        <button class="btn small" data-act="resumeAutoFile">Réactiver</button></div>`);
    const last = parseInt(localStorage.getItem(EXPORT_KEY)||"0", 10);
    if(DB && DB.entries.length && (Date.now()-last) > 14*86400000)
      parts.push(`<div class="notice"><div class="grow">💾 Aucune copie de sécurité récente. Téléchargez une sauvegarde (ou activez la sauvegarde automatique dans Paramètres).</div>
        <button class="btn small" data-act="backup">Télécharger maintenant</button></div>`);
    document.getElementById("notices").innerHTML = parts.join("");
  },

  /* ── Versions précédentes ── */
  renderSnapshots(){
    const el = document.getElementById("snapshotList");
    if(!el) return;
    (async ()=>{
      let snaps = [];
      try{ const raw = await snapshotsRead(); snaps = JSON.parse(raw||"[]"); }catch(e){}
      if(!snaps.length){ el.innerHTML = `<p class="muted">Aucune version pour l'instant.</p>`; return; }
      el.innerHTML = `<table class="data"><tbody>` + snaps.map((s,i)=>{
        const d    = new Date(s.t);
        const when = d.toLocaleDateString("fr-BE") + " " + d.toLocaleTimeString("fr-BE",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
        const cur  = i===snaps.length-1 ? ` <span class="badge">état actuel</span>` : "";
        return `<tr><td>Version du ${when}${cur}</td>
          <td style="text-align:right">${i===snaps.length-1?"":`<button class="btn small secondary" data-act="restoreSnapshot" data-arg="${i}">↩ Revenir à cette version</button>`}</td></tr>`;
      }).reverse().join("") + `</tbody></table>`;
    })();
  },

  restoreSnapshot(i){
    (async ()=>{
      let snaps = [];
      try{ const raw = await snapshotsRead(); snaps = JSON.parse(raw||"[]"); }catch(e){}
      const s = snaps[+i]; if(!s) return;
      const d = new Date(s.t);
      if(!confirm(`Revenir à la version du ${d.toLocaleDateString("fr-BE")} à ${d.toLocaleTimeString("fr-BE",{hour:"2-digit",minute:"2-digit"})} ?\n\nLes modifications faites après ce moment seront annulées (l'état actuel reste disponible dans la liste des versions).`)) return;
      await storageWrite(s.raw);
      location.reload();
    })();
  },

  /* ── Mot de passe ── */
  updatePwdStatus(){
    const on = !!cryptoKey;
    const el = document.getElementById("pwdStatus");
    el.textContent = on
      ? "🔒 Protection active : les données sont chiffrées (AES-256). Le mot de passe sera demandé à chaque ouverture."
      : "🔓 Aucun mot de passe : les données sont lisibles par toute personne ayant accès à "
        + (isTauri ? "cet ordinateur." : "ce navigateur.");
    document.getElementById("pwdRemoveBtn").style.display = on ? "inline-block" : "none";
  },

  async setPassword(){
    if(!crypto.subtle) return toast("Chiffrement indisponible dans ce navigateur (ouvrez le fichier dans Chrome, Edge ou Firefox).", true);
    const p1 = document.getElementById("setPwd1").value;
    const p2 = document.getElementById("setPwd2").value;
    if(p1.length<4) return toast("Le mot de passe doit comporter au moins 4 caractères.", true);
    if(p1!==p2)     return toast("Les deux mots de passe ne correspondent pas.", true);
    passSalt  = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await deriveKey(p1, passSalt);
    await save();
    document.getElementById("setPwd1").value = "";
    document.getElementById("setPwd2").value = "";
    this.updatePwdStatus();
    toast("Mot de passe activé — données chiffrées ✔");
  },

  async removePassword(){
    if(!confirm("Désactiver le mot de passe ? Les données seront enregistrées sans chiffrement.")) return;
    cryptoKey = null; passSalt = null;
    await save();
    this.updatePwdStatus();
    toast("Mot de passe désactivé.");
  },

  /* ── Navigation ── */
  showTab(id){
    document.querySelectorAll(".tab-pane").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("active", b.dataset.tab===id));
    document.getElementById("tab-"+id).classList.add("active");
    this.renderAll();
  },

  setYear(el){ const v = (el && el.value!==undefined) ? el.value : el; curYear = parseInt(v,10); this.renderAll(); },

  refreshYears(){
    const years = new Set([new Date().getFullYear()]);
    DB.entries.forEach(e=>{ if(e.date) years.add(parseInt(e.date.slice(0,4),10)); });
    const sel = document.getElementById("yearSelect");
    sel.innerHTML = [...years].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===curYear?"selected":""}>${y}</option>`).join("");
    document.getElementById("nextYearLbl").textContent = curYear+1;
  },

  renderAll(){
    this.refreshYears();
    this.renderDashboard();
    this.renderJournal();
    this.renderAccounts();
    this.renderSnapshots();
    this.renderNotices();
    document.getElementById("appTitle").textContent = (DB.settings.name||"ASBL") + " — Comptabilité";
  },

  /* ── Sélecteurs ── */
  fillSelectors(){
    const jSel = document.getElementById("eJournal");
    jSel.innerHTML = JOURNALS.map(j=>`<option value="${j.code}">${j.code} — ${j.label}</option>`).join("");
    const jF = document.getElementById("jFilter");
    jF.innerHTML = `<option value="">Tous les journaux</option>` + JOURNALS.map(j=>`<option value="${j.code}">${j.code} — ${j.label}</option>`).join("");
    const mode = document.getElementById("sMode");
    mode.innerHTML = `<option value="550000">Banque (550000)</option><option value="570000">Caisse (570000)</option>`;
    this.fillSimpleAccounts();
  },

  fillSimpleAccounts(){
    const type    = document.getElementById("sType").value;
    const modeSel = document.getElementById("sMode");
    const wrap    = document.getElementById("sAccountWrap");
    const modeLbl = document.getElementById("sModeLbl");
    if(type==="vir"){
      wrap.style.display = "none";
      modeLbl.textContent = "Sens du virement";
      modeSel.innerHTML = `<option value="b2c">De la banque vers la caisse (retrait)</option>
        <option value="c2b">De la caisse vers la banque (dépôt)</option>`;
      return;
    }
    wrap.style.display = "";
    modeLbl.textContent = "Par banque ou en liquide ?";
    modeSel.innerHTML = `<option value="550000">Banque (550000)</option><option value="570000">Caisse — argent liquide (570000)</option>`;

    const GROUPS = {
      "10":"Fonds de l'association","13":"Fonds affectés","14":"Résultat reporté",
      "16":"Provisions","17":"Dettes à plus d'un an",
      "22":"Terrains et bâtiments (investissements)","23":"Installations (investissements)",
      "24":"Mobilier et matériel (investissements)",
      "30":"Stocks","40":"Créances — argent à recevoir","41":"Créances diverses",
      "44":"Fournisseurs et factures à recevoir","45":"Dettes sociales et fiscales (ONSS, précompte…)",
      "46":"Autres dettes","47":"Autres dettes","48":"Autres dettes","49":"Comptes de régularisation",
      "50":"Placements","51":"Placements","52":"Placements","53":"Placements",
      "54":"Valeurs disponibles","55":"Banques","56":"Banques","57":"Caisses","58":"Virements internes",
      "60":"Achats et marchandises","61":"Fonctionnement, biens et services",
      "62":"Personnel et rémunérations","63":"Amortissements et provisions",
      "64":"Autres charges","65":"Charges financières","66":"Charges exceptionnelles",
      "70":"Recettes d'activités","71":"Production","72":"Production immobilisée",
      "73":"Cotisations, dons et subsides","74":"Subsides et produits divers",
      "75":"Produits financiers","76":"Produits exceptionnels"
    };
    const groupName = c => GROUPS[c.slice(0,2)]
      || ({"1":"Fonds et dettes long terme","2":"Investissements (immobilisations)","3":"Stocks","4":"Créances et dettes","5":"Placements et liquidités"}[c[0]])
      || ("Comptes "+c.slice(0,2));

    const buildGroups = accs=>{
      let html="", curGrp=null;
      accs.forEach(a=>{
        const g = groupName(a.code);
        if(g!==curGrp){ if(curGrp!==null) html+=`</optgroup>`; html+=`<optgroup label="${esc(g)}">`; curGrp=g; }
        html += `<option value="${a.code}">${a.code} — ${esc(a.label)}</option>`;
      });
      if(curGrp!==null) html+=`</optgroup>`;
      return html;
    };

    const all = accountsSorted().filter(a=>a.code!=="550000" && a.code!=="570000");
    document.getElementById("sAccount").innerHTML =
      buildGroups(all) +
      `<optgroup label="────────────"><option value="__new__">➕ Créer une nouvelle catégorie…</option></optgroup>`;

    const first = all.find(a=>a.code[0]===(type==="dep"?"6":"7"));
    if(first) document.getElementById("sAccount").value = first.code;
  },

  onSimpleAccountChange(sel){
    if(sel.value!=="__new__") return;
    const type = document.getElementById("sType").value;
    const name = prompt("Nom de la nouvelle catégorie de "+(type==="dep"?"dépense":"recette")+" :\n(ex : « Frais de formation bénévoles »)");
    if(!name || !name.trim()){ this.fillSimpleAccounts(); return; }
    let code = type==="dep" ? 618000 : 707000;
    while(DB.accounts.some(a=>a.code===String(code))) code += 10;
    DB.accounts.push({code:String(code), label:name.trim()});
    save();
    this.fillSelectors();
    document.getElementById("sAccount").value = String(code);
    this.renderAccounts();
    toast(`Catégorie « ${name.trim()} » créée (compte ${code}) ✔`);
  },

  accountOptions(selected){
    return `<option value="">— compte —</option>` + accountsSorted()
      .map(a=>`<option value="${a.code}" ${a.code===selected?"selected":""}>${a.code} — ${esc(a.label)}</option>`).join("");
  },

  /* ── Tableau de bord ── */
  renderDashboard(){
    const bal = balances(curYear);
    let prod=0, chg=0;
    for(const code in bal){
      if(code[0]==="7") prod = r2(prod + bal[code].cre - bal[code].deb);
      if(code[0]==="6") chg  = r2(chg  + bal[code].deb - bal[code].cre);
    }
    const res  = r2(prod-chg);
    const bank = solde(bal,"550000"), cash = solde(bal,"570000");
    const k = (lbl,val,cls)=>`<div class="kpi"><div class="lbl">${lbl}</div><div class="val ${cls||""}">${fmt(val)} €</div></div>`;
    document.getElementById("kpis").innerHTML =
      k("Produits "+curYear, prod) + k("Charges "+curYear, chg) +
      k((res>=0?"Bénéfice":"Perte")+" "+curYear, res, res>=0?"pos":"neg") +
      k("Banque + Caisse", r2(bank+cash));
    const last = entriesOfYear(curYear).slice(-8).reverse();
    document.getElementById("dashLast").innerHTML = last.length
      ? this.entriesTable(last, true)
      : `<p class="muted">Aucune opération pour ${curYear}.<br><br>
         <b>Pour démarrer :</b> ① complétez l'identité de l'ASBL dans <i>Paramètres</i>,
         ② encodez vos dépenses et recettes dans <i>Encoder</i>,
         ③ en cas de doute, consultez l'onglet <i>❓ Aide</i> — il explique tout, pas à pas, sans jargon.</p>`;
  },

  /* ── Formulaire simple ── */
  resetSimpleForm(){
    document.getElementById("sDate").value    = new Date().toISOString().slice(0,10);
    document.getElementById("sAmount").value  = "";
    document.getElementById("sComment").value = "";
    document.getElementById("sEditId").value  = "";
    document.getElementById("sSaveBtn").textContent      = "Enregistrer l'opération";
    document.getElementById("sCancelBtn").style.display  = "none";
  },

  simpleInfo(e){
    if(!e.lines || e.lines.length!==2) return null;
    const bank = e.lines.find(l=>l.account==="550000");
    const cash = e.lines.find(l=>l.account==="570000");
    if(bank && cash){
      if(cash.debit>0 && bank.credit>0) return {type:"vir", dir:"b2c", amount:cash.debit};
      if(bank.debit>0 && cash.credit>0) return {type:"vir", dir:"c2b", amount:bank.debit};
      return null;
    }
    const fin = e.lines.find(l=>l.account==="550000"||l.account==="570000");
    const oth = e.lines.find(l=>l.account!=="550000"&&l.account!=="570000");
    if(!fin || !oth) return null;
    if(oth.debit>0  && fin.credit>0) return {type:"dep", fin:fin.account, acc:oth.account, amount:oth.debit};
    if(oth.credit>0 && fin.debit>0)  return {type:"rec", fin:fin.account, acc:oth.account, amount:oth.credit};
    return null;
  },

  saveSimple(){
    const type   = document.getElementById("sType").value;
    const fin    = document.getElementById("sMode").value;
    const date   = document.getElementById("sDate").value;
    const amount = r2(parseAmount(document.getElementById("sAmount").value));
    const acc    = document.getElementById("sAccount").value;
    let comment  = document.getElementById("sComment").value.trim();
    if(!date)      return toast("Indiquez une date.", true);
    if(amount<=0)  return toast("Indiquez un montant positif.", true);
    const year = parseInt(date.slice(0,4), 10);
    let journal, lines;
    if(type==="vir"){
      const dir = fin;
      if(!comment) comment = dir==="b2c" ? "Retrait banque → caisse" : "Dépôt caisse → banque";
      journal = dir==="b2c" ? "BAN" : "CAI";
      lines = dir==="b2c"
        ? [{account:"570000", debit:amount, credit:0},{account:"550000", debit:0, credit:amount}]
        : [{account:"550000", debit:amount, credit:0},{account:"570000", debit:0, credit:amount}];
    } else {
      if(!acc || acc==="__new__") return toast("Choisissez une catégorie.", true);
      journal = fin==="570000" ? "CAI" : "BAN";
      lines = type==="dep"
        ? [{account:acc, debit:amount, credit:0},{account:fin, debit:0, credit:amount}]
        : [{account:fin, debit:amount, credit:0},{account:acc, debit:0, credit:amount}];
    }
    const editId = document.getElementById("sEditId").value;
    if(editId){
      const e = DB.entries.find(x=>x.id===editId);
      if(e){
        if(e.journal!==journal || e.date.slice(0,4)!==date.slice(0,4)){
          e.journal = journal; e.piece = nextPiece(journal, year);
        }
        e.date = date; e.comment = comment; e.lines = lines;
      }
      toast("Opération corrigée ✔");
    } else {
      DB.entries.push({id:crypto.randomUUID(), journal, piece:nextPiece(journal,year), date, comment, lines});
      toast("Opération enregistrée ✔");
    }
    save();
    this.resetSimpleForm();
    this.renderAll();
  },

  /* ── Écriture avancée ── */
  resetEntryForm(){
    document.getElementById("eDate").value    = new Date().toISOString().slice(0,10);
    document.getElementById("eComment").value = "";
    document.getElementById("eEditId").value  = "";
    document.getElementById("eCancelBtn").style.display = "none";
    document.getElementById("eSaveBtn").textContent     = "Enregistrer l'écriture";
    const tb = document.getElementById("eLines");
    tb.innerHTML = "";
    this.addLine(); this.addLine();
    this.updateBalance();
  },

  addLine(account, debit, credit){
    const tb = document.getElementById("eLines");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><select class="lAcc">${this.accountOptions(account||"")}</select></td>
      <td><input type="number" class="lDeb num" step="0.01" min="0" value="${debit||""}" data-input="updateBalance"></td>
      <td><input type="number" class="lCre num" step="0.01" min="0" value="${credit||""}" data-input="updateBalance"></td>
      <td><button class="btn small danger" data-act="removeLine">✕</button></td>`;
    tb.appendChild(tr);
  },

  readLines(){
    return [...document.querySelectorAll("#eLines tr")].map(tr=>({
      account: tr.querySelector(".lAcc").value,
      debit:   r2(parseAmount(tr.querySelector(".lDeb").value)),
      credit:  r2(parseAmount(tr.querySelector(".lCre").value)),
    })).filter(l=>l.account && (l.debit>0 || l.credit>0));
  },

  updateBalance(){
    const ls   = this.readLines();
    const d    = sum(ls,l=>l.debit), c = sum(ls,l=>l.credit);
    const el   = document.getElementById("eBalance");
    const diff = r2(d-c);
    if(ls.length===0){ el.textContent=""; return; }
    if(diff===0){
      el.textContent = `Équilibré : ${fmt(d)} € au débit = ${fmt(c)} € au crédit ✔`;
      el.className   = "balanceInfo ok";
    } else {
      el.textContent = `Déséquilibre de ${fmt(Math.abs(diff))} € (débit ${fmt(d)} / crédit ${fmt(c)})`;
      el.className   = "balanceInfo ko";
    }
  },

  saveEntry(){
    const date    = document.getElementById("eDate").value;
    const journal = document.getElementById("eJournal").value;
    const comment = document.getElementById("eComment").value.trim();
    const lines   = this.readLines();
    if(!date)          return toast("Indiquez une date.", true);
    if(lines.length<2) return toast("Une écriture doit avoir au moins 2 lignes.", true);
    const d = sum(lines,l=>l.debit), c = sum(lines,l=>l.credit);
    if(r2(d-c)!==0) return toast("L'écriture n'est pas équilibrée (débit ≠ crédit).", true);
    const editId = document.getElementById("eEditId").value;
    if(editId){
      const e = DB.entries.find(x=>x.id===editId);
      if(e){ e.journal=journal; e.date=date; e.comment=comment; e.lines=lines; }
      toast("Écriture modifiée ✔");
    } else {
      const year = parseInt(date.slice(0,4), 10);
      DB.entries.push({id:crypto.randomUUID(), journal, piece:nextPiece(journal,year), date, comment, lines});
      toast("Écriture enregistrée ✔");
    }
    save();
    this.resetEntryForm();
    this.renderAll();
  },

  editEntry(id){
    const e = DB.entries.find(x=>x.id===id);
    if(!e) return;
    const si = this.simpleInfo(e);
    if(si){
      this.showTab("encode");
      document.getElementById("sType").value = si.type;
      this.fillSimpleAccounts();
      document.getElementById("sMode").value    = si.type==="vir" ? si.dir : si.fin;
      if(si.type!=="vir") document.getElementById("sAccount").value = si.acc;
      document.getElementById("sDate").value    = e.date;
      document.getElementById("sAmount").value  = si.amount;
      document.getElementById("sComment").value = e.comment||"";
      document.getElementById("sEditId").value  = e.id;
      document.getElementById("sSaveBtn").textContent     = "Enregistrer la correction";
      document.getElementById("sCancelBtn").style.display = "inline-block";
      return;
    }
    this.showTab("encode");
    document.getElementById("eJournal").value = e.journal;
    document.getElementById("eDate").value    = e.date;
    document.getElementById("eComment").value = e.comment||"";
    document.getElementById("eEditId").value  = e.id;
    document.getElementById("eCancelBtn").style.display = "inline-block";
    document.getElementById("eSaveBtn").textContent     = "Enregistrer la modification";
    const tb = document.getElementById("eLines"); tb.innerHTML="";
    e.lines.forEach(l=>this.addLine(l.account, l.debit||"", l.credit||""));
    this.updateBalance();
  },

  cancelEdit(){ this.resetEntryForm(); },

  /* Boutons reliés par délégation (data-act) nécessitant un petit relais */
  addLineBtn(){ this.addLine(); },
  pickRestore(){ document.getElementById("restoreFile").click(); },
  removeLine(_arg, el){ if(el) el.closest("tr").remove(); this.updateBalance(); },

  deleteEntry(id){
    const e = DB.entries.find(x=>x.id===id);
    if(!e) return;
    if(!confirm(`Supprimer l'écriture ${e.journal} ${e.piece} du ${dFR(e.date)} ?`)) return;
    DB.entries = DB.entries.filter(x=>x.id!==id);
    save(); toast("Écriture supprimée."); this.renderAll();
  },

  /* ── Liste des écritures ── */
  entriesTable(entries, withActions){
    let h = `<table class="data"><thead><tr>
      <th>Journal</th><th>Pièce</th><th>Date</th><th>Commentaire</th><th>Compte</th>
      <th class="num">Débit</th><th class="num">Crédit</th>${withActions?"<th></th>":""}</tr></thead><tbody>`;
    entries.forEach(e=>{
      e.lines.forEach((l,i)=>{
        h += `<tr>
          <td>${i===0?`<span class="badge">${e.journal}</span>`:""}</td>
          <td>${i===0?esc(e.piece||""):""}</td>
          <td>${i===0?dFR(e.date):""}</td>
          <td>${i===0?esc(e.comment||""):""}</td>
          <td>${l.account} ${esc(accLabel(l.account))}</td>
          <td class="num debit">${l.debit?fmt(l.debit):""}</td>
          <td class="num creditc">${l.credit?fmt(l.credit):""}</td>
          ${withActions ? (i===0
            ? `<td style="white-space:nowrap">
                <button class="btn small secondary" title="Corriger" data-act="editEntry" data-arg="${e.id}">✎ Modifier</button>
                <button class="btn small danger"    title="Supprimer" data-act="deleteEntry" data-arg="${e.id}">✕</button></td>`
            : "<td></td>") : ""}
        </tr>`;
      });
    });
    return h+"</tbody></table>";
  },

  renderJournal(){
    const f = document.getElementById("jFilter").value;
    const q = (document.getElementById("jSearch").value||"").toLowerCase();
    let entries = entriesOfYear(curYear);
    if(f) entries = entries.filter(e=>e.journal===f);
    if(q) entries = entries.filter(e=>
      (e.comment||"").toLowerCase().includes(q) || (e.piece||"").includes(q) ||
      e.lines.some(l=>l.account.includes(q) || accLabel(l.account).toLowerCase().includes(q)));
    document.getElementById("journalList").innerHTML = entries.length
      ? this.entriesTable(entries, true)
      : `<p class="muted">Aucune écriture.</p>`;
  },

  exportCSV(){
    const rows = [["Journal","Pièce","Date","Commentaire","Compte","Libellé compte","Débit","Crédit"]];
    entriesOfYear(curYear).forEach(e=> e.lines.forEach(l=>
      rows.push([e.journal, e.piece, e.date, e.comment||"", l.account, accLabel(l.account),
                 String(l.debit||0).replace(".",","), String(l.credit||0).replace(".",",")])));
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");
    this.download(`ecritures_${curYear}.csv`, "﻿"+csv, "text/csv");
  },

  /* ── Plan comptable ── */
  renderAccounts(){
    const bal = balances(curYear);
    let h = `<table class="data"><thead><tr><th>N°</th><th>Libellé</th><th class="num">Débit ${curYear}</th><th class="num">Crédit ${curYear}</th><th class="num">Solde</th><th></th></tr></thead><tbody>`;
    accountsSorted().forEach(a=>{
      const b = bal[a.code]||{deb:0, cre:0};
      const s = r2(b.deb-b.cre);
      h += `<tr><td><b>${a.code}</b></td><td>${esc(a.label)}</td>
        <td class="num">${b.deb?fmt(b.deb):""}</td><td class="num">${b.cre?fmt(b.cre):""}</td>
        <td class="num">${s?fmt(s):""}</td>
        <td><button class="btn small secondary" data-act="loadAccount" data-arg="${a.code}">✎</button>
            <button class="btn small danger"    data-act="deleteAccount" data-arg="${a.code}">✕</button></td></tr>`;
    });
    document.getElementById("accountsList").innerHTML = h+"</tbody></table>";
  },

  loadAccount(code){
    const a = DB.accounts.find(x=>x.code===code);
    if(!a) return;
    document.getElementById("accCode").value  = a.code;
    document.getElementById("accLabel").value = a.label;
  },

  addAccount(){
    const code  = document.getElementById("accCode").value.trim();
    const label = document.getElementById("accLabel").value.trim();
    if(!/^\d{4,6}$/.test(code)) return toast("Le n° de compte doit comporter 4 à 6 chiffres.", true);
    if(!label) return toast("Indiquez un libellé.", true);
    const ex = DB.accounts.find(a=>a.code===code);
    if(ex){ ex.label = label; toast("Compte modifié ✔"); }
    else   { DB.accounts.push({code,label}); toast("Compte ajouté ✔"); }
    save();
    document.getElementById("accCode").value=""; document.getElementById("accLabel").value="";
    this.fillSelectors(); this.renderAccounts();
  },

  deleteAccount(code){
    const used = DB.entries.some(e=>e.lines.some(l=>l.account===code));
    if(used) return toast("Impossible : ce compte est utilisé dans des écritures.", true);
    if(!confirm(`Supprimer le compte ${code} ?`)) return;
    DB.accounts = DB.accounts.filter(a=>a.code!==code);
    save(); this.fillSelectors(); this.renderAccounts();
  },

  /* ── Paramètres ── */
  applySettingsToUI(){
    const s = DB.settings;
    document.getElementById("setName").value   = s.name||"";
    document.getElementById("setAddr1").value  = s.addr1||"";
    document.getElementById("setAddr2").value  = s.addr2||"";
    document.getElementById("setVat").value    = s.vat||"";
    document.getElementById("setSigner").value = s.signer||"";
  },

  saveSettings(){
    DB.settings = {
      name:   document.getElementById("setName").value.trim()||"ASBL",
      addr1:  document.getElementById("setAddr1").value.trim(),
      addr2:  document.getElementById("setAddr2").value.trim(),
      vat:    document.getElementById("setVat").value.trim(),
      signer: document.getElementById("setSigner").value.trim(),
    };
    save(); toast("Paramètres enregistrés ✔"); this.renderAll();
  },

  backup(){
    this.download(
      `sauvegarde_compta_${DB.settings.name.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.json`,
      JSON.stringify(DB,null,1), "application/json");
    localStorage.setItem(EXPORT_KEY, String(Date.now()));
    this.renderNotices();
  },

  restore(input){
    const f = input.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      input.value = "";   // toujours vider, même si l'utilisateur annule
      try{
        const data = JSON.parse(r.result);
        if(data.__enc===1){
          if(confirm("Cette sauvegarde est protégée par un mot de passe. La charger ? (le mot de passe sera demandé)")){
            storageWrite(r.result).then(()=>location.reload());
          }
          return;
        }
        if(!data.accounts || !data.entries) throw new Error("format");
        if(!confirm("Remplacer toutes les données actuelles par cette sauvegarde ?")) return;
        loadPlain(data);   // complète settings/accounts/entries manquants
        save();
        this.fillSelectors(); this.applySettingsToUI(); this.renderAll();
        toast("Sauvegarde restaurée ✔");
      }catch(e){ toast("Fichier de sauvegarde invalide.", true); }
    };
    r.readAsText(f);
  },

  resetAll(){
    if(!confirm("Effacer TOUTES les données (écritures, comptes, paramètres) ? Cette action est irréversible.")) return;
    if(!confirm("Vraiment sûr ? Pensez à faire une sauvegarde d'abord.")) return;
    DB = defaultDB(); cryptoKey = null; passSalt = null; save();
    this.updatePwdStatus();
    this.fillSelectors(); this.applySettingsToUI(); this.renderAll();
    toast("Données effacées.");
  },

  async closeYear(){
    const y = curYear, ny = y+1;
    const exists = DB.entries.some(e=>e.journal==="ODR" && e.date===`${ny}-01-01`);
    if(exists && !confirm(`Une écriture d'ouverture existe déjà au 01-01-${ny}. En créer une nouvelle quand même ?`)) return;
    const bal   = balances(y);
    const res   = resultOfYear(bal);
    const lines = [];
    accountsSorted().forEach(a=>{
      const c = a.code[0];
      if(c==="6"||c==="7") return;
      let s = solde(bal, a.code);
      if(a.code==="140000") s = r2(s - res);
      if(s>0)      lines.push({account:a.code, debit:s, credit:0});
      else if(s<0) lines.push({account:a.code, debit:0, credit:r2(-s)});
    });
    if(lines.length===0) return toast("Aucun solde à reporter pour "+y+".", true);
    DB.entries.push({
      id: crypto.randomUUID(), journal:"ODR", piece: nextPiece("ODR", ny),
      date:`${ny}-01-01`, comment:`Ouverture automatique (report ${y})`, lines
    });
    await save();
    toast(`Écriture d'ouverture ${ny} créée (${lines.length} lignes) ✔`);
    curYear = ny;
    this.renderAll();
  },

  download(name, content, mime){
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([content], {type:mime}));
    a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  },

  /* ── Rapports ── */
  report(kind){
    const bal = balances(curYear);
    let html = "";
    switch(kind){
      case "cr":         html = Reports.htmlCR(bal); break;
      case "bilan":      html = Reports.htmlBilan(bal); break;
      case "charges":    html = Reports.htmlCharges(bal); break;
      case "balance":    html = Reports.htmlBalance(bal); break;
      case "historique": html = Reports.htmlHistorique(); break;
      case "annuels":
        html = Reports.htmlCover() + Reports.htmlCR(bal) + Reports.htmlBilan(bal) +
               Reports.htmlCharges(bal) + Reports.htmlBalance(bal);
        break;
    }
    document.getElementById("reportContent").innerHTML = html || "<p>Rien à afficher.</p>";
    this._lastReport = kind;
  },

  printReport(){
    if(!this._lastReport){ toast("Générez d'abord un rapport.", true); return; }
    document.body.classList.add("print-report");
    document.querySelectorAll(".tab-pane").forEach(p=>p.classList.remove("active"));
    document.getElementById("tab-reports").classList.add("active");
    window.print();
    document.body.classList.remove("print-report");
  },
};

/* Retire le panneau de diagnostic de démarrage (statique dans le HTML). */
function hideBoot(){
  const b = document.getElementById("bootDiag");
  if(b) b.remove();
}

/* Garde-fou : toute erreur au démarrage doit être VISIBLE, jamais un écran vide.
   Le message est mémorisé pour survivre aux réaffichages de renderNotices(). */
let fatalMsg = null;
function showFatal(msg){
  hideBoot();
  fatalMsg = msg;
  const el = document.getElementById("notices");
  if(el) el.innerHTML = fatalHTML() + el.innerHTML;
}
function fatalHTML(){
  return fatalMsg ? `<div class="notice"><div class="grow">❌ <b>Erreur au démarrage :</b> ${esc(fatalMsg)}<br>
    Réessayez de fermer/rouvrir l'application. Si le problème persiste, signalez ce message.</div></div>` : "";
}
window.addEventListener("error", e=>showFatal(e.message||"erreur inconnue"));

/* ── Branchement des événements par DÉLÉGATION (compatible CSP : aucun
   gestionnaire on* en ligne). Les écouteurs posés sur document captent
   aussi les éléments générés dynamiquement (boutons des tableaux, etc.).
   - data-act    : clic  → App[act](data-arg, élément, event)
   - data-change : change→ App[change](élément)
   - data-input  : input → App[input](élément) ── */
function wireUI(){
  document.addEventListener("click", e=>{
    const el = e.target.closest("[data-act]"); if(!el) return;
    const fn = el.dataset.act;
    if(typeof App[fn]==="function") App[fn](el.dataset.arg, el, e);
  });
  document.addEventListener("change", e=>{
    const el = e.target.closest("[data-change]"); if(!el) return;
    const fn = el.dataset.change;
    if(typeof App[fn]==="function") App[fn](el);
  });
  document.addEventListener("input", e=>{
    const el = e.target.closest("[data-input]"); if(!el) return;
    const fn = el.dataset.input;
    if(typeof App[fn]==="function") App[fn](el);
  });
  const lp = document.getElementById("lockPwd");
  if(lp) lp.addEventListener("keydown", e=>{ if(e.key==="Enter") App.unlock(); });
}

window.addEventListener("DOMContentLoaded", ()=>{
  // Vérifie que les 5 scripts se sont bien chargés (diagnostic robuste,
  // sans dépendre des autres fichiers). Si l'un manque, on le NOMME à l'écran.
  var need = ["config","storage","accounting","reports","ui"];
  var got  = (window.__L || []).concat("ui");   // ui.js s'exécute ici, donc présent
  var miss = need.filter(function(n){ return got.indexOf(n) < 0; });
  if(miss.length){
    var step = document.getElementById("bootStep");
    if(step){
      step.textContent = "Erreur : fichier(s) non chargé(s) → " + miss.join(", ")
        + "  (chargés : " + got.join(", ") + ")";
      step.style.color = "#c62828";
    }
    return;   // ne pas tenter de démarrer si une brique manque
  }
  try{ wireUI(); }catch(e){ console.error("wireUI:", e); }
  App.init().catch(e=>{
    console.error("Init:", e);
    showFatal(e.message||String(e));
    if(!DB) loadPlain(null);          // ne jamais écraser des données déjà chargées
    try{ App.start(); }catch(e2){ console.error(e2); }
  });
});
