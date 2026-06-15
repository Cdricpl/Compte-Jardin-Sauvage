"use strict";

const Reports = {

  rpHead(){
    const s = DB.settings;
    return `<div class="rp-head">
      <div class="rp-name">${esc(s.name)}</div>
      <div class="rp-sub">${esc(s.addr1)}</div>
      <div class="rp-sub">${esc(s.addr2)}</div>
      <div class="rp-sub">${esc(s.vat)}</div></div>`;
  },

  /* ── Compte de résultats ── */
  htmlCR(bal){
    const y = curYear;
    const rows = [];
    const line    = (lbl,v,col) => rows.push(`<tr><td class="lbl">${esc(lbl)}</td><td class="c1">${col===1?fmt(v):""}</td><td class="c2">${col===2?fmt(v):""}</td><td class="c3">${col===3?fmt(v):""}</td></tr>`);
    const subtotal = v          => rows.push(`<tr class="subtotal"><td class="lbl"></td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(v)}</td></tr>`);
    const bigline  = (lbl,v)    => rows.push(`<tr class="totalline"><td class="lbl" style="text-align:right;padding-right:30px">${esc(lbl)}</td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(v)}</td></tr>`);
    const blank    = ()         => rows.push(`<tr><td colspan="4">&nbsp;</td></tr>`);

    // Comptes 6/7 déjà repris : garantit que le résultat du CR == resultOfYear
    // (sinon un compte ajouté en 71/72/77 ou 67/68/69 fausserait le résultat).
    const seen = new Set();
    const mark = arr => { arr.forEach(a=>seen.add(a.code)); return arr; };

    rows.push(`<tr><td colspan="4" class="rp-section">PRODUITS ET CHARGES D'EXPLOITATION</td></tr>`);

    const p70 = mark(accountsIn(bal, c=>c.startsWith("70")).filter(a=>a.mv));
    p70.forEach(a=>line(a.label, r2(-a.s), 2));
    const t70 = sum(p70, a=>r2(-a.s));
    if(p70.length) subtotal(t70);

    const p73 = mark(accountsIn(bal, c=>/^7[1-4]/.test(c)).filter(a=>a.mv));
    p73.forEach(a=>line(a.label, r2(-a.s), 2));
    const t73 = sum(p73, a=>r2(-a.s));
    if(p73.length) subtotal(t73);

    const marge = r2(t70+t73);
    bigline("MARGE BRUTE D'EXPLOITATION :", marge);
    blank();

    const grp = (pred, lbl)=>{
      const accs = mark(accountsIn(bal,pred).filter(a=>a.mv));
      const tot  = sum(accs, a=>a.s);
      if(accs.length){
        line(lbl, r2(-tot), 2);
        rows.push(`<tr><td class="lbl" style="font-style:italic;font-size:12px">(suivant le détail en annexe)</td><td colspan="3"></td></tr>`);
      }
      return tot;
    };
    const t6061 = grp(c=>c.startsWith("60")||c.startsWith("61"), "Biens et services divers");
    const t62   = grp(c=>c.startsWith("62"), "Rémunérations et charges sociales");
    const t63   = grp(c=>c.startsWith("63"), "Dotations aux amortissements et provisions");
    const t64   = grp(c=>c.startsWith("64"), "Autres charges d'exploitation");
    const totCh = r2(t6061+t62+t63+t64);
    subtotal(r2(-totCh));
    const resExp = r2(marge - totCh);
    bigline(resExp>=0?"BENEFICE D'EXPLOITATION :":"PERTE D'EXPLOITATION :", resExp);
    blank();

    rows.push(`<tr><td colspan="4" class="rp-section">PRODUITS ET CHARGES FINANCIERES</td></tr>`);
    const p75 = mark(accountsIn(bal,c=>c.startsWith("75")).filter(a=>a.mv));
    p75.forEach(a=>line(a.label, r2(-a.s), 2));
    const c65 = mark(accountsIn(bal,c=>c.startsWith("65")).filter(a=>a.mv));
    c65.forEach(a=>line(a.label, r2(-a.s), 2));
    const tFin = r2(sum(p75,a=>r2(-a.s)) - sum(c65,a=>a.s));
    subtotal(tFin);
    let res = r2(resExp + tFin);

    const p76 = mark(accountsIn(bal,c=>c.startsWith("76")||c.startsWith("77")).filter(a=>a.mv));
    const c66 = mark(accountsIn(bal,c=>c.startsWith("66")).filter(a=>a.mv));
    if(p76.length||c66.length){
      blank();
      rows.push(`<tr><td colspan="4" class="rp-section">PRODUITS ET CHARGES EXCEPTIONNELS</td></tr>`);
      p76.forEach(a=>line(a.label, r2(-a.s), 2));
      c66.forEach(a=>line(a.label, r2(-a.s), 2));
      const tExc = r2(sum(p76,a=>r2(-a.s)) - sum(c66,a=>a.s));
      subtotal(tExc);
      res = r2(res + tExc);
    }

    // Filet de sécurité : tout produit (7) / charge (6) non repris ci-dessus,
    // pour que le résultat affiché égale toujours celui du bilan (resultOfYear).
    const autresP = accountsIn(bal, c=>c[0]==="7").filter(a=>a.mv && !seen.has(a.code));
    const autresC = accountsIn(bal, c=>c[0]==="6").filter(a=>a.mv && !seen.has(a.code));
    if(autresP.length||autresC.length){
      blank();
      rows.push(`<tr><td colspan="4" class="rp-section">AUTRES PRODUITS ET CHARGES</td></tr>`);
      autresP.forEach(a=>line(a.label, r2(-a.s), 2));
      autresC.forEach(a=>line(a.label, r2(-a.s), 2));
      const tAutres = r2(sum(autresP,a=>r2(-a.s)) - sum(autresC,a=>a.s));
      subtotal(tAutres);
      res = r2(res + tAutres);
    }
    blank();
    bigline(res>=0?"BENEFICE DE L'EXERCICE A AFFECTER :":"PERTE DE L'EXERCICE A AFFECTER :", res);
    blank();

    const reporte    = r2(-solde(bal,"140000"));
    const aAffecter  = r2(res + reporte);
    rows.push(`<tr><td colspan="4" style="font-weight:bold;text-decoration:underline">Affectation et prélèvements</td></tr>`);
    rows.push(`<tr><td class="lbl">${aAffecter>=0?"Bénéfice à affecter":"Perte à affecter"}</td><td class="c1"></td><td class="c2">${fmt(aAffecter)}</td><td class="c3"></td></tr>`);
    rows.push(`<tr><td class="lbl" style="padding-left:14px">${res>=0?"Bénéfice de l'exercice":"Perte de l'exercice à reporter"}</td><td class="c1">${fmt(res)}</td><td class="c2"></td><td class="c3"></td></tr>`);
    rows.push(`<tr><td class="lbl" style="padding-left:14px">${reporte>=0?"Bénéfice reporté des exercices précédents":"Perte reportée des exercices précédents"}</td><td class="c1">${fmt(reporte)}</td><td class="c2"></td><td class="c3"></td></tr>`);
    rows.push(`<tr><td class="lbl">${aAffecter>=0?"Bénéfice à reporter":"Perte à reporter"}</td><td class="c1"></td><td class="c2">${fmt(r2(-aAffecter))} (-)</td><td class="c3"></td></tr>`);

    const signer = DB.settings.signer
      ? `<div class="rp-sign"><div style="text-align:center">Certifié exact le &nbsp;&nbsp;/&nbsp;&nbsp;/${y+1}</div><br><div style="margin-left:60px">${esc(DB.settings.signer)}</div></div>`
      : "";
    return `<div class="rp-page">${this.rpHead()}
      <div class="rp-title">COMPTE DE RESULTATS AU 31.12.${y}</div>
      <table class="rp">${rows.join("")}</table>${signer}</div>`;
  },

  /* ── Bilan actif / passif ── */
  htmlBilan(bal){
    const y   = curYear;
    const res = resultOfYear(bal);

    // Un compte de classe 1-5 est « classé » s'il tombe dans une rubrique
    // explicite ci-dessous. Tout compte NON classé est repris dans « Autres
    // actifs/passifs » selon le signe de son solde → le total des deux côtés
    // capte toujours 100 % des soldes, donc le bilan reste toujours équilibré.
    const classified = c =>
      /^[235]/.test(c) || /^4[0-8]/.test(c) || /^49[0-3]/.test(c) ||
      /^1[0-35]/.test(c) || /^1[67]/.test(c) || c==="140000";

    /* ACTIF */
    const a = [];
    const aline = (lbl,v,col) => a.push(`<tr><td class="lbl">${esc(lbl)}</td><td class="c1">${col===1?fmt(v):""}</td><td class="c2">${col===2?fmt(v):""}</td><td class="c3">${col===3?fmt(v):""}</td></tr>`);
    const asub  = v            => a.push(`<tr class="subtotal"><td class="lbl"></td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(v)}</td></tr>`);
    const asec  = t            => a.push(`<tr><td colspan="4" class="rp-section">${t}</td></tr>`);
    let totA = 0;

    const immo = accountsIn(bal, c=>/^2/.test(c)).filter(x=>x.mv||x.s!==0);
    if(immo.length){
      asec("IMMOBILISATIONS");
      let totImmo = 0;
      immo.forEach(x=>{ aline(x.label, x.s, 2); totImmo = r2(totImmo+x.s); });
      asub(totImmo);
      a.push(`<tr class="totalline"><td class="lbl" style="text-align:right;padding-right:30px">TOTAL IMMOBILISATIONS NETTES :</td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(totImmo)}</td></tr>`);
      totA = r2(totA+totImmo);
    }
    const stocks = accountsIn(bal, c=>/^3/.test(c)).filter(x=>x.s!==0);
    if(stocks.length){
      asec("STOCKS");
      let t=0; stocks.forEach(x=>{ aline(x.label, x.s, 2); t=r2(t+x.s); });
      asub(t); totA = r2(totA+t);
    }
    const crea = accountsIn(bal, c=>/^4(0|1)/.test(c)).filter(x=>x.s!==0);
    if(crea.length){
      asec("CREANCES A UN AN AU PLUS");
      let t=0; crea.forEach(x=>{ aline(x.label, x.s, 2); t=r2(t+x.s); });
      asub(t); totA = r2(totA+t);
    }
    const dispo = accountsIn(bal, c=>/^5/.test(c)).filter(x=>x.mv||x.s!==0);
    if(dispo.length){
      asec("VALEURS DISPONIBLES");
      let t=0; dispo.forEach(x=>{ aline(x.label, x.s, 2); t=r2(t+x.s); });
      asub(t); totA = r2(totA+t);
    }
    const regA = accountsIn(bal, c=>c==="490000"||c==="491000").filter(x=>x.s!==0);
    if(regA.length){
      asec("COMPTES DE REGULARISATION");
      let t=0; regA.forEach(x=>{ aline(x.label, x.s, 2); t=r2(t+x.s); });
      asub(t); totA = r2(totA+t);
    }
    // Filet de sécurité : tout compte d'actif (classe 1-5, solde débiteur)
    // non classé ci-dessus, pour qu'aucun montant ne disparaisse du total.
    const autreA = accountsIn(bal, c=>/^[1-5]/.test(c)).filter(x=>x.s>0 && !classified(x.code));
    if(autreA.length){
      asec("AUTRES ACTIFS");
      let t=0; autreA.forEach(x=>{ aline(x.label, x.s, 2); t=r2(t+x.s); });
      asub(t); totA = r2(totA+t);
    }
    a.push(`<tr class="totalline"><td class="lbl" style="text-align:right;padding-right:30px">TOTAL DE L'ACTIF :</td><td class="c1"></td><td class="c2"></td><td class="c3" style="border-top:3px double #000">${fmt(totA)}</td></tr>`);

    /* PASSIF */
    const p = [];
    const pline = (lbl,v,col) => p.push(`<tr><td class="lbl">${esc(lbl)}</td><td class="c1">${col===1?fmt(v):""}</td><td class="c2">${col===2?fmt(v):""}</td><td class="c3">${col===3?fmt(v):""}</td></tr>`);
    const psub  = v            => p.push(`<tr class="subtotal"><td class="lbl"></td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(v)}</td></tr>`);
    const psec  = t            => p.push(`<tr><td colspan="4" class="rp-section">${t}</td></tr>`);
    let totP = 0;

    const fonds = accountsIn(bal, c=>/^1[0-35]/.test(c)).filter(x=>x.s!==0);  // 10-13 fonds + 15 subsides en capital
    psec("FONDS DE L'ASSOCIATION");
    let tF=0;
    fonds.forEach(x=>{ pline(x.label, r2(-x.s), 3); tF=r2(tF-x.s); });
    const reporteFinal = r2(-solde(bal,"140000") + res);  // 140000 traité ici (classé)
    psec(reporteFinal>=0 ? "BENEFICE REPORTE" : "PERTE REPORTEE");
    pline(reporteFinal>=0 ? "Bénéfice reporté" : "Perte reportée", reporteFinal, 3);
    const capProp = r2(tF + reporteFinal);
    p.push(`<tr class="totalline"><td class="lbl" style="text-align:right;padding-right:30px">TOTAL DES CAPITAUX PROPRES :</td><td class="c1"></td><td class="c2"></td><td class="c3">${fmt(capProp)}</td></tr>`);
    totP = r2(totP + capProp);

    const prov = accountsIn(bal, c=>/^16/.test(c)).filter(x=>x.s!==0);
    if(prov.length){ psec("PROVISIONS"); let t=0; prov.forEach(x=>{ pline(x.label, r2(-x.s), 3); t=r2(t-x.s); }); psub(t); totP=r2(totP+t); }
    const dLT = accountsIn(bal, c=>/^17/.test(c)).filter(x=>x.s!==0);
    if(dLT.length){ psec("DETTES A PLUS D'UN AN"); let t=0; dLT.forEach(x=>{ pline(x.label, r2(-x.s), 3); t=r2(t-x.s); }); psub(t); totP=r2(totP+t); }

    const dCT = accountsIn(bal, c=>/^4[2-8]/.test(c)).filter(x=>x.s!==0);
    if(dCT.length){
      psec("DETTES A UN AN AU PLUS");
      let t=0; dCT.forEach(x=>{ pline(x.label, r2(-x.s), 2); t=r2(t-x.s); });
      psub(t); totP=r2(totP+t);
    }
    const regP = accountsIn(bal, c=>c==="492000"||c==="493000").filter(x=>x.s!==0);
    if(regP.length){
      psec("COMPTES DE REGULARISATION");
      let t=0; regP.forEach(x=>{ pline(x.label, r2(-x.s), 3); t=r2(t-x.s); });
      psub(t); totP=r2(totP+t);
    }
    // Filet de sécurité : tout compte de passif (classe 1-5, solde créditeur)
    // non classé ci-dessus, pour qu'aucun montant ne disparaisse du total.
    const autreP = accountsIn(bal, c=>/^[1-5]/.test(c)).filter(x=>x.s<0 && !classified(x.code));
    if(autreP.length){
      psec("AUTRES PASSIFS");
      let t=0; autreP.forEach(x=>{ pline(x.label, r2(-x.s), 3); t=r2(t-x.s); });
      psub(t); totP=r2(totP+t);
    }
    p.push(`<tr class="totalline"><td class="lbl" style="text-align:right;padding-right:30px">TOTAL DU PASSIF :</td><td class="c1"></td><td class="c2"></td><td class="c3" style="border-top:3px double #000">${fmt(totP)}</td></tr>`);

    let warn = "";
    if(r2(totA-totP)!==0)
      warn = `<p style="color:#c62828;font-weight:bold" class="no-print">⚠ Le bilan n'est pas équilibré (écart de ${fmt(r2(totA-totP))} €). Vérifiez vos écritures et l'écriture d'ouverture.</p>`;

    return `<div class="rp-page">${this.rpHead()}
        <div class="rp-title">BILAN AU 31.12.${y}</div>
        <div class="rp-section" style="font-size:15px">ACTIF</div>
        <table class="rp">${a.join("")}</table>${warn}</div>
      <div class="rp-page">${this.rpHead()}
        <div class="rp-title">BILAN AU 31.12.${y}</div>
        <div class="rp-section" style="font-size:15px">PASSIF</div>
        <table class="rp">${p.join("")}</table></div>`;
  },

  /* ── Détail des charges ── */
  htmlCharges(bal){
    const y = curYear;
    const rows = [];
    const block = (pred, title)=>{
      const accs = accountsIn(bal,pred).filter(x=>x.mv);
      if(!accs.length) return;
      rows.push(`<tr><td colspan="3" class="rp-section">${title}</td></tr>`);
      let t=0;
      accs.forEach(x=>{
        rows.push(`<tr><td class="lbl">${esc(x.label)}</td><td class="c1">${fmt(x.s)}</td><td class="c2"></td></tr>`);
        t = r2(t+x.s);
      });
      rows.push(`<tr class="subtotal"><td class="lbl"></td><td class="c1" style="font-weight:bold">${fmt(t)}</td><td class="c2"></td></tr>`);
      rows.push(`<tr><td colspan="3">&nbsp;</td></tr>`);
    };
    block(c=>c.startsWith("60")||c.startsWith("61"), "Biens et services");
    block(c=>c.startsWith("62"), "Rémunérations, charges sociales");
    block(c=>c.startsWith("63"), "Dotations aux amortissements et provisions");
    block(c=>c.startsWith("64"), "Autres charges d'exploitation");
    block(c=>c.startsWith("65"), "Charges financières");
    block(c=>c.startsWith("66"), "Charges exceptionnelles");
    block(c=>/^6[789]/.test(c), "Autres charges");
    return `<div class="rp-page">${this.rpHead()}
      <div class="rp-title">DETAIL DES CHARGES D'EXPLOITATION AU 31.12.${y}</div>
      <table class="rp"><colgroup><col style="width:60%"><col style="width:20%"><col style="width:20%"></colgroup>${rows.join("")}</table></div>`;
  },

  /* ── Balance des comptes généraux ── */
  htmlBalance(bal){
    const y = curYear;
    const rows = [];
    let tD=0, tC=0;
    accountsSorted().forEach(a=>{
      const b = bal[a.code]; if(!b) return;
      const s = r2(b.deb-b.cre);
      const sd = s>0?s:0, sc = s<0?-s:0;
      if(s===0 && !b.deb && !b.cre) return;
      rows.push(`<tr><td>${a.code}</td><td>${esc(a.label)}</td><td class="num">${sd?fmt(sd):(s===0?"0,00":"")}</td><td class="num">${sc?fmt(sc):""}</td></tr>`);
      tD=r2(tD+sd); tC=r2(tC+sc);
    });
    return `<div class="rp-page">${this.rpHead()}
      <div class="rp-title">BALANCE DES COMPTES GENERAUX AU 31.12.${y}</div>
      <table class="rp-bal">
        <thead><tr><th>N°</th><th style="text-align:left">Compte</th><th>SOLDE DEBIT</th><th>SOLDE CREDIT</th></tr></thead>
        <tbody>${rows.join("")}
        <tr class="tot"><td></td><td>TOTAUX :</td><td class="num">${fmt(tD)}</td><td class="num">${fmt(tC)}</td></tr></tbody>
      </table></div>`;
  },

  /* ── Historique des comptes généraux ── */
  htmlHistorique(){
    const y = curYear;
    const perAcc = {};
    entriesOfYear(y).forEach(e=> e.lines.forEach(l=>{
      (perAcc[l.account] = perAcc[l.account]||[]).push({e, l});
    }));
    const blocks = [];
    accountsSorted().forEach(a=>{
      const mv = perAcc[a.code]; if(!mv) return;
      let run=0, tD=0, tC=0;
      const rws = mv.map(({e,l})=>{
        run = r2(run + (l.debit||0) - (l.credit||0));
        tD  = r2(tD  + (l.debit||0));
        tC  = r2(tC  + (l.credit||0));
        return `<tr><td>${e.journal}</td><td>${esc(e.piece||"")}</td><td>${dFR(e.date)}</td><td>${esc(e.comment||"")}</td>
          <td class="num">${l.debit?fmt(l.debit):""}</td><td class="num">${l.credit?fmt(l.credit):""}</td><td class="num">${fmt(run)}</td></tr>`;
      }).join("");
      blocks.push(`<div class="rp-hist-acc">${a.code} &nbsp; ${esc(a.label).toUpperCase()}</div>
        <table class="rp-hist">
          <thead><tr><th>Journal</th><th>Pièce</th><th>Date</th><th>Commentaire</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde cumulé</th></tr></thead>
          <tbody>${rws}<tr class="tot"><td colspan="4">Totaux</td><td class="num">${fmt(tD)}</td><td class="num">${fmt(tC)}</td><td class="num">${fmt(r2(tD-tC))}</td></tr></tbody>
        </table>`);
    });
    return `<div class="rp-page">${this.rpHead()}
      <div class="rp-title">HISTORIQUE DES COMPTES GENERAUX — EXERCICE ${y}</div>
      ${blocks.join("") || "<p>Aucune écriture.</p>"}</div>`;
  },

  /* ── Page de garde ── */
  htmlCover(){
    const s = DB.settings, y = curYear;
    return `<div class="rp-page"><div class="rp-cover">
      <div><div class="big">${esc(s.name)}</div><div>${esc(s.addr1)}</div><div>${esc(s.addr2)}</div><div>${esc(s.vat)}</div></div>
      <div><div>***</div><div class="big" style="margin:8px 0">COMPTES ANNUELS ARRETES AU 31.12.${y}</div><div>***</div></div>
      <div>&nbsp;</div></div></div>`;
  },
};

/* marqueur de chargement (diagnostic) */
try{(window.__L=window.__L||[]).push("reports");}catch(e){}
