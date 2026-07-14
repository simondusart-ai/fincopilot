# Navette : documentation

## 1. Objectif

Navette outille la campagne budgétaire d'une société en croissance. Chaque Head of construit sa navette (objectifs et moyens, saisis par trimestre) dans un portail avec son propre accès ; la finance consolide en continu un P&L mensuel de l'année budgétée, la contribution de chaque département, les KPIs dérivés (MRR, marge de contribution, burn, runway, CAC par canal, NRR, payback) et les alertes par rapport au cadrage décidé en comité de direction. L'outil remplace les allers-retours de fichiers Excel par départements : la consolidation prend dix secondes au lieu de plusieurs jours, et chaque arbitrage (v1 vers v2 d'une navette) est chiffré en impact EBITDA et trésorerie.

## 2. Architecture

Trois couches strictement séparées :

- **Le moteur** (`src/lib/engine/`) : module TypeScript pur, sans dépendance à la base ni au front. Entrées : configuration société + navettes. Sorties : P&L mensuel, contributions, KPIs, alertes. Le module `actuals.ts` calcule en plus les indicateurs mensuels réalisés (base clients, churn logo, ARPA implicite, NRR, CAC, burn, runway) pour l'écran de pilotage. Déterministe, couvert par la suite de tests (`npm test`, 51 tests dont les calculs vérifiés à la main). Aucun texte généré par IA : toutes les alertes sont des constats calculés.
- **Les données** (Supabase / Postgres) : toute la configuration société vit en tables (départements, drivers, enveloppes, plafonds CAC, seuils de runway, conventions), jamais dans le code. La sécurité par ligne (RLS) limite chaque Head of à son département ; le CFO voit tout. Une navette soumise est figée par les policies mêmes de la base.
- **Le portail** (Next.js) : login, saisie des navettes avec versions, dashboard de consolidation, comparateur de versions, écran de pilotage (indicateurs mensuels réalisés et pont vers le budget), réglages du cadrage, export Excel du classeur codir.

## 3. Mode d'emploi

Prérequis : Node 18+, un projet Supabase.

1. `npm install`
2. Exécuter les migrations dans l'ordre dans l'éditeur SQL Supabase : `0001_init.sql`, `0002_new_driver_kinds.sql`, puis `0003_actuals.sql` (historique réalisé et cibles de pilotage).
3. Copier `.env.example` en `.env.local` avec l'URL du projet et la clé publique (anon / publishable).
4. Données de démonstration : `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed` (rejouable : remet la démo à zéro en trente secondes). Comptes créés : `cfo@fincopilot.demo`, `tech@`, `sales@`, `growth@`, `ops@`, `fap@` (et `cfo@hexafloor.demo`, `produit@`, `commerce@`, `support@`) ; mot de passe unique `Navette-demo-2026`.
5. `npm run dev` puis http://localhost:3000 (ou déploiement Vercel : importer le repo, renseigner les deux variables d'environnement).

Cycle d'usage : le CFO définit le cadrage dans Réglages (enveloppes, plafonds, seuils, hypothèses) ; chaque Head of remplit sa navette et la soumet (elle est alors figée, toute modification passe par une nouvelle version) ; le CFO suit la consolidation en direct, compare les versions après arbitrage, exporte le classeur codir.

## 4. Conventions de calcul

- **Saisie trimestrielle, sortie mensuelle.** Les flux sont mensualisés linéairement, ou selon une clé saisonnière nommée (12 coefficients, définie par société) ; la somme des mois égale toujours la somme des trimestres. Les effectifs sont un niveau (chaque mois du trimestre porte la valeur), la masse salariale peut aussi se saisir directement en euros.
- **Revenu : roll-forward de MRR.** MRR de fin de mois = MRR d'ouverture + nouveau MRR (clients par canal x ARPA, ou MRR direct) + expansion - churn (taux mensuel appliqué au MRR d'ouverture). Revenu du mois = MRR de fin de mois + revenus non récurrents.
- **Marge brute.** Si la société déclare des lignes COGS dans ses navettes, marge brute = revenu - COGS déclarés ; sinon, taux de la configuration. Le payback utilise la marge effective du budget.
- **EBITDA = marge brute - coûts hors COGS ; burn = EBITDA** (pas de capex, BFR ni TVA modélisés). Runway = trésorerie / burn moyen des trois derniers mois. NRR annualisé = ((MRR ouvert + expansion - churn) / MRR ouvert) ^ 12. CAC par canal et par trimestre = dépenses / nouveaux clients.
- **Indicateurs réalisés (écran de pilotage).** Base clients par roll-forward : base de fin = base d'ouverture + nouveaux - churnés, ancrée sur la base d'ouverture société au premier mois d'historique. Churn logo mensuel = churnés / base d'ouverture ; ARPA implicite = MRR de fin / base de fin. NRR : valeur mesurée si saisie, sinon proxy annualisé ((MRR fin - nouveaux x ARPA implicite) / MRR ouvert) ^ 12. Ce proxy est une approximation : le NRR réel par cohorte sur douze mois exige de la donnée client par client (piste d'adaptation). CAC moyen chargé = S&M du mois / nouveaux clients, comparé à la cible société ; CAC par canal = dépenses / nouveaux clients, comparé au plafond du canal. Marge de contribution % = (revenu x taux de marge brute - S&M) / revenu, avec revenu = CA du mois si saisi, sinon MRR de fin. Burn = trésorerie de fin - trésorerie de fin du mois précédent ; runway = trésorerie / burn du dernier mois disponible. Une donnée manquante laisse la case vide, toute division par zéro renvoie une valeur absente : jamais d'erreur ni de blocage.
- **Contrôles bloquants vs alertes.** Bloquant = intégrité des données (navette manquante ou en double, schéma altéré, valeur négative ou non numérique, brouillon non soumis) : le moteur refuse alors de produire le moindre chiffre. Alerte = règle de gestion dépassée (enveloppe, plafond CAC, seuils de runway, NRR sous 100 %, payback) : on consolide et on signale, car un dépassement de cadrage est un objet d'arbitrage, pas une erreur.

## 5. Limites connues

Un utilisateur appartient à une seule société (pas de multi-tenant complet). Pas de workflow d'approbation ni d'audit trail au-delà du versionnage v1..vn. Saisie trimestrielle uniquement. Burn assimilé à l'EBITDA : pas de capex, de variation de BFR, de TVA ni de décalages d'encaissement. Monnaie unique. L'écran de pilotage historise les réalisés mensuels et fait le pont vers le budget, avec deux réserves : pour la démonstration, le S&M mensuel 2026 est estimé (CAC trimestriel de l'Annexe A x nouveaux clients du mois), non repris d'un extrait comptable ligne à ligne ; et le NRR réalisé s'appuie sur la valeur mesurée saisie, à défaut sur un proxy annualisé, les cohortes client par client restant une piste d'adaptation. Les valeurs négatives sont refusées à la saisie : les crédits ou refacturations se traitent en réduction d'une ligne. Le modèle de revenu suppose un ARPA moyen constant sur l'année.

## 6. Pistes d'adaptation

Déployer pour une autre société ne demande aucun code : une configuration (départements, drivers, cadrage) et des comptes ; c'est ce que démontre la seconde société du seed. Extensions naturelles, par ordre de valeur : connexion aux outils comptables pour reprendre les réalisés ligne à ligne et calcul du NRR par cohorte client par client (l'écran de pilotage mensuel réalisé vs budget est déjà en place) ; workflow de validation (soumission, demande de correction, approbation codir) ; générateur de business case branché sur les mêmes conventions ; multi-tenant complet avec une société par espace ; connexion aux outils comptables pour initialiser les navettes ; ré-estimé en cours d'année (forecast glissant) en réutilisant le même moteur.

## 7. Reprise par un autre développeur

Le moteur est importable tel quel côté serveur ou dans un autre front : c'est une fonction pure `consolidate(inputs)` documentée par ses types (`src/lib/engine/types.ts`) et spécifiée par ses tests. Pour toute évolution, commencer par écrire le test. `npm test` doit rester vert avant tout déploiement ; `npm run debug:seed` imprime la consolidation des données de démonstration sans base ni front.
