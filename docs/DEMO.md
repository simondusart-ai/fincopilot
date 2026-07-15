# Déroulé de démonstration (11 minutes)

Préparation, avant la restitution : `npm run seed` pour remettre la démo à zéro ; deux fenêtres de navigateur prêtes (une normale connectée en `cfo@fincopilot.demo`, une privée connectée en `growth@fincopilot.demo`) ; le serveur qui tourne ; une fenêtre de terminal ouverte sur le repo.

**0. Contexte (30 s).** Chez Cleany, je pilotais la campagne budgétaire par navettes Excel bilatérales avec chaque Head of : consolidation manuelle, aucune vision en temps réel. Navette est l'outil que j'aurais voulu avoir, et la première brique du processus budgétaire évoqué pour Nopillo.

**1. La consolidation vivante (1 min 30).** Fenêtre CFO, écran Budget FinCopilot : les cinq navettes soumises, le P&L mensuel N+1 reconstruit en direct, les KPIs (CA +40 %, breakeven en cours d'année, CAC moyen, runway). Trois alertes sorties toutes seules : SEA au-dessus du plafond de 515 € aux T1 et T2, NRR sous 100 % au T1. Ce sont exactement les seuils décidés en Sections 1 et 2 : la gouvernance proposée au codir est ici en production.

**2. Chacun chez soi (1 min).** Fenêtre privée, compte Head of Growth : il ne voit que sa navette, pas de consolidation, pas les autres départements. Sécurité par ligne dans la base, pas un filtre d'affichage.

**3. Un arbitrage en direct (2 min).** Côté Growth : créer une nouvelle version de la navette, gonfler les dépenses SEA, tenter une valeur négative : la soumission est refusée avec un message localisé (T par T). Corriger, soumettre. Côté CFO : recharger, le P&L bouge, l'alerte d'enveloppe apparaît. Principe énoncé à l'oral : une erreur de données bloque la consolidation, un dépassement de cadrage ne la bloque jamais, il se signale et s'arbitre.

**4. Le diff, la réalité d'une campagne (1 min).** Depuis Ma navette (Growth), le lien Comparer les versions (visible pour la direction dès deux versions) ouvre le comparateur pré-filtré sur le département : Growth v1 vers v2 (l'arbitrage pré-chargé du seed), lignes modifiées, impact +660 K€ d'EBITDA et de trésorerie. C'est la trace chiffrée de chaque aller-retour budgétaire.

**5. La gouvernance est une donnée (45 s).** Directement sur l'écran Budget, éditer en ligne le plafond de CAC du canal SEA de 515 à 560 € (crayon dans la section CAC par canal) : les alertes CAC disparaissent aussitôt, sans quitter l'écran ni recharger. Le CEO comme le CFO peuvent le faire, ainsi que les enveloppes de département : suivre une reco du comité en changeant un plafond en direct. Le cadrage codir est une configuration, pas du code.

**6. Réutilisabilité (1 min).** Déconnexion, `cfo@hexafloor.demo` : autre société, trois départements, autres drivers, autres seuils, même code. Son budget déclenche runway sous seuil de gel et trésorerie négative : l'outil dit "budget non finançable en l'état".

**7. Le pilotage mensuel, réalisé vs budget (1 min 30).** Fenêtre CFO, onglet Pilotage, exercice 2026 : les indicateurs réalisés mois par mois (MRR, ajouts nets, ARPA implicite, NRR, CAC moyen vs cible 515 €, marge de contribution, burn, runway) et le P&L annuel 2024-2026 avec une colonne Budget 2027 (CA et EBITDA issus des navettes). Les alertes sont sorties par le moteur : CAC moyen au-dessus de la cible au second semestre. Basculer sur l'exercice 2027 (vide), saisir janvier en direct dans la grille (nouveaux, churnés, MRR, S&M, trésorerie), enregistrer : la tuile de janvier et les indicateurs se recalculent aussitôt. Le pont réalisé vs budget est en place, sans quitter le moteur.

**8. Le business case, décider et arbitrer (1 min 30).** Onglet Business case : saisir en direct les hypothèses du projet CGP en lecture défavorable (revenus 200/600/1200 K, coûts récurrents 800/1600/3200 K, une équipe dédiée, invest de lancement en année 1), cibler FA&P. Le moteur sort une VAN négative, un cumul de -4 300 K et un payback non atteint : constat factuel. Proposer le business case, puis ouvrir la navette FA&P : il y figure en lignes distinctes (salaires, opex), en attente. Le CFO ou le CEO l'accepte ou le rejette d'un clic ; accepté, il s'ajoute à la masse salariale du département et à la consolidation, rejeté il reste sans effet. C'est l'arbitrage de la Section 2, tracé et chiffré.

**8 bis. Les deux trajectoires du mémoire (1 min).** Onglet Simulation (CFO ou CEO) : le P&L annuel projeté sur trois exercices à partir du réalisé 2026. Bascule « as is » : à S&M au rythme historique, l'EBITDA N+1 plonge à -5 110 K€ et la trésorerie s'épuise vers 15 mois (badge et clôture en pêche « trésorerie négative »). Basculer sur « rebound » : à S&M gelé, le même CA donne un EBITDA N+1 de +140 K€ et une trésorerie qui ne descend jamais sous l'ouverture. La carte « L'effort traduit en CAC » montre ce que cela impose (environ 13 400 clients bruts, CAC équivalent ~521 €). Ajuster une hypothèse (croissance, marge, S&M gelé) recalcule tout instantanément, sans rien écrire en base. C'est la Section 2 rejouée en direct.

**9. Le workflow de validation, la navette telle qu'on la vit (1 min 30).** Ouvrir la navette Sales : elle n'est plus une grille de drivers abstraits mais des lignes libres nommées (Head of Sales, Sales executive 1 à 3, Hubspot, Aircall, Lemlist), chacune marquée existante ou nouvelle, avec sa fréquence de décaissement. Se connecter en `ceo@fincopilot.demo`, la renvoyer au métier avec un motif ("Le troisième Sales executive n'est pas finançable au T2"). Côté Head of Sales : la timeline affiche "v1 renvoyée le JJ/MM/AAAA : motif", la navette sort de la consolidation, il crée une v2 qui reprend automatiquement ses lignes libres, corrige, resoumet. Le CFO ou le CEO valide : la v2 est consolidée. Le budget cesse d'être un fichier, il devient une conversation tracée.

**10. Sous le capot et roadmap (45 s).** Terminal : `npm test`, 145 tests verts, calculs vérifiés à la main, aucun chiffre rédigé par IA. Roadmap : reprise des réalisés depuis la comptabilité (le réalisé poste par poste alimentera la colonne T-1), NRR par cohorte client par client, multi-tenant.

## Plans de secours

1. Démo nominale : application déployée sur Vercel (indépendante de ma machine).
2. Si le réseau de la salle est douteux : `npm run dev` en local, même base Supabase.
3. Si Supabase est injoignable : `npm run debug:seed` dans le terminal montre le moteur consolider les deux sociétés sans réseau, et la vidéo enregistrée de la démo prend le relais pour le portail.

Après tout passage de démonstration : rejouer `npm run seed` pour remettre les données à zéro.
