# Comptabilité EDD ASBL

Programme de comptabilité en partie double pour ASBL belge (plan comptable PCMN),
conçu pour encoder les opérations au fil de l'année et exporter en PDF des
**comptes annuels** au format classique des fiduciaires : compte de résultats,
bilan (actif / passif), détail des charges, balance des comptes généraux et
historique des comptes généraux.

## Démarrage

Aucune installation : ouvrez simplement le fichier **`index.html`** dans un
navigateur (Chrome, Edge, Firefox…). Tout fonctionne **hors ligne** — aucune
connexion internet n'est nécessaire, le fichier peut être copié sur une clé
USB ou le bureau de l'ordinateur.

> Les données sont enregistrées localement dans le navigateur (localStorage).
> Pensez à faire régulièrement une **sauvegarde JSON** via l'onglet *Paramètres*.

## Protection par mot de passe

Dans l'onglet *Paramètres*, section **Mot de passe**, vous pouvez activer une
protection : les données comptables sont alors **chiffrées** (AES-256-GCM, clé
dérivée du mot de passe par PBKDF2) et le mot de passe est demandé à chaque
ouverture du programme.

- Sans le mot de passe, les données stockées sont illisibles.
- ⚠ **Il n'existe aucun moyen de récupérer un mot de passe oublié.** Faites
  régulièrement une sauvegarde JSON (non chiffrée) et conservez-la en lieu
  sûr : elle permet de restaurer la comptabilité en cas d'oubli.
- Le mot de passe peut être changé ou désactivé à tout moment dans *Paramètres*.

## Aucune perte de données

- **Enregistrement automatique** : chaque action est sauvée immédiatement
  (indicateur 💾 en haut de l'écran) — il n'y a pas de bouton « sauver » à oublier.
- **Tout est corrigeable** : chaque opération encodée peut être modifiée
  (bouton « ✎ Modifier ») ou supprimée, depuis le tableau de bord ou l'onglet
  *Opérations*. Les opérations simples se rouvrent dans le formulaire facile.
- **Versions précédentes** : les 15 derniers états de la comptabilité sont
  conservés ; on peut revenir en arrière en un clic (onglet *Paramètres*).
- **Sauvegarde automatique dans un fichier** : dans *Paramètres*, choisissez un
  fichier (PC ou clé USB) qui sera mis à jour à chaque modification
  (Chrome / Edge).
- **Rappel** : si aucune copie de sécurité n'a été faite depuis 14 jours, un
  bandeau le rappelle.

## Pour les débutants

L'onglet **❓ Aide** explique tout sans jargon : comment encoder une dépense ou
une recette, comment corriger une erreur, quoi faire en fin d'année, et un
petit lexique. L'encodage courant se fait via le formulaire « Opération
simple » : type (argent qui sort / qui rentre), banque ou caisse, montant,
catégorie — la partie double est générée automatiquement.

## Utilisation

1. **Paramètres** : encodez la dénomination de l'ASBL, l'adresse, le n° BCE et
   le signataire des comptes. Faites-y aussi vos sauvegardes/restaurations.
2. **Plan comptable** : un plan PCMN adapté aux ASBL (école des devoirs, stages,
   subventions Forem/ONE/communales…) est préchargé. Vous pouvez ajouter,
   modifier ou supprimer des comptes.
3. **Encodage** :
   - *Opération simple* : pour une dépense ou une recette payée par banque ou
     caisse — l'écriture en partie double est générée automatiquement.
   - *Écriture avancée* : écriture multi-lignes (salaires, ONSS, amortissements,
     provisions, opérations diverses, ouverture…). L'enregistrement est bloqué
     tant que débit ≠ crédit.
4. **Écritures** : consultation, recherche, modification, suppression, export CSV.
5. **Rapports & Comptes annuels** : générez la fiche complète (page de garde,
   compte de résultats, bilan, détail des charges, balance) ou chaque rapport
   séparément, puis cliquez sur **Imprimer / Exporter en PDF** et choisissez
   « Enregistrer au format PDF » comme imprimante.
6. **Clôture d'exercice** (onglet *Paramètres*) : génère automatiquement
   l'écriture d'ouverture de l'exercice suivant (report des soldes de bilan et
   affectation du résultat au compte 140000 « Bénéfice reporté »).

## Journaux

| Code | Usage |
|------|-------|
| BAN  | Opérations bancaires |
| CAI  | Opérations de caisse |
| ODV  | Opérations diverses (salaires, amortissements, régularisations…) |
| ODR  | Ouverture / réouverture d'exercice |

## Première mise en route d'un exercice

Si l'ASBL a déjà un historique, encodez une écriture **ODR** au 01/01 reprenant
les soldes du bilan de clôture précédent (banque, caisse, immobilisations,
amortissements cumulés, dettes, patrimoine de départ 100000, résultat reporté
140000). Le bouton de clôture s'en chargera automatiquement pour les exercices
suivants.
