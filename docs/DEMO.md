# Déroulé de démonstration (10 minutes)

Préparation, avant la restitution : `npm run seed` pour remettre la démo à zéro ; deux fenêtres de navigateur prêtes (une normale connectée en `cfo@fincopilot.demo`, une privée connectée en `growth@fincopilot.demo`) ; le serveur qui tourne ; une fenêtre de terminal ouverte sur le repo.

**0. Contexte (30 s).** Chez Cleany, je pilotais la campagne budgétaire par navettes Excel bilatérales avec chaque Head of : consolidation manuelle, aucune vision en temps réel. Navette est l'outil que j'aurais voulu avoir, et la première brique du processus budgétaire évoqué pour Nopillo.

**1. La consolidation vivante (1 min 30).** Fenêtre CFO, dashboard FinCopilot : les cinq navettes soumises, le P&L mensuel N+1 reconstruit en direct, les KPIs (CA +40 %, breakeven en cours d'année, CAC moyen, runway). Trois alertes sorties toutes seules : SEA au-dessus du plafond de 515 € aux T1 et T2, NRR sous 100 % au T1. Ce sont exactement les seuils décidés en Sections 1 et 2 : la gouvernance proposée au codir est ici en production.

**2. Chacun chez soi (1 min).** Fenêtre privée, compte Head of Growth : il ne voit que sa navette, pas de consolidation, pas les autres départements. Sécurité par ligne dans la base, pas un filtre d'affichage.

**3. Un arbitrage en direct (2 min).** Côté Growth : créer une nouvelle version de la navette, gonfler les dépenses SEA, tenter une valeur négative : la soumission est refusée avec un message localisé (T par T). Corriger, soumettre. Côté CFO : recharger, le P&L bouge, l'alerte d'enveloppe apparaît. Principe énoncé à l'oral : une erreur de données bloque la consolidation, un dépassement de cadrage ne la bloque jamais, il se signale et s'arbitre.

**4. Le diff, la réalité d'une campagne (1 min).** Page Versions : Growth v1 vers v2 (l'arbitrage pré-chargé du seed) : lignes modifiées, impact +660 K€ d'EBITDA et de trésorerie. C'est la trace chiffrée de chaque aller-retour budgétaire.

**5. La gouvernance est une donnée (45 s).** Réglages : passer le plafond SEA de 515 à 560 €, recharger le dashboard : les alertes CAC disparaissent. Le cadrage codir est une configuration, pas du code.

**6. Réutilisabilité (1 min).** Déconnexion, `cfo@hexafloor.demo` : autre société, trois départements, autres drivers, autres seuils, même code. Son budget déclenche runway sous seuil de gel et trésorerie négative : l'outil dit "budget non finançable en l'état".

**7. Le pilotage mensuel, réalisé vs budget (1 min 30).** Fenêtre CFO, onglet Pilotage, exercice 2026 : les indicateurs réalisés mois par mois (MRR, ajouts nets, ARPA implicite, NRR, CAC moyen vs cible 515 €, marge de contribution, burn, runway) et le P&L annuel 2024-2026 avec une colonne Budget 2027 (CA et EBITDA issus des navettes). Les alertes sont sorties par le moteur : CAC moyen au-dessus de la cible au second semestre. Basculer sur l'exercice 2027 (vide), saisir janvier en direct dans la grille (nouveaux, churnés, MRR, S&M, trésorerie), enregistrer : la tuile de janvier et les indicateurs se recalculent aussitôt. Le pont réalisé vs budget est en place, sans quitter le moteur.

**8. Le business case, décider et arbitrer (1 min 30).** Onglet Business case : saisir en direct les hypothèses du projet CGP en lecture défavorable (revenus 200/600/1200 K, coûts récurrents 800/1600/3200 K, une équipe dédiée, invest de lancement en année 1), cibler FA&P. Le moteur sort une VAN négative, un cumul de -4 300 K et un payback non atteint : constat factuel. Proposer le business case, puis ouvrir la navette FA&P : il y figure en lignes distinctes (salaires, opex), en attente. Le CFO ou le CEO l'accepte ou le rejette d'un clic ; accepté, il s'ajoute à la masse salariale du département et à la consolidation, rejeté il reste sans effet. C'est l'arbitrage de la Section 2, tracé et chiffré.

**9. Sous le capot et roadmap (45 s).** Terminal : `npm test`, 62 tests verts, calculs vérifiés à la main, aucun chiffre rédigé par IA. Roadmap : reprise des réalisés depuis la comptabilité, NRR par cohorte client par client, workflow d'approbation, multi-tenant.

## Plans de secours

1. Démo nominale : application déployée sur Vercel (indépendante de ma machine).
2. Si le réseau de la salle est douteux : `npm run dev` en local, même base Supabase.
3. Si Supabase est injoignable : `npm run debug:seed` dans le terminal montre le moteur consolider les deux sociétés sans réseau, et la vidéo enregistrée de la démo prend le relais pour le portail.

Après tout passage de démonstration : rejouer `npm run seed` pour remettre les données à zéro.
