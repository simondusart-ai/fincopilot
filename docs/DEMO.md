# Déroulé de démonstration (8 minutes)

Préparation, avant la restitution : `npm run seed` pour remettre la démo à zéro ; deux fenêtres de navigateur prêtes (une normale connectée en `cfo@fincopilot.demo`, une privée connectée en `growth@fincopilot.demo`) ; le serveur qui tourne ; une fenêtre de terminal ouverte sur le repo.

**0. Contexte (30 s).** Chez Cleany, je pilotais la campagne budgétaire par navettes Excel bilatérales avec chaque Head of : consolidation manuelle, aucune vision en temps réel. Navette est l'outil que j'aurais voulu avoir, et la première brique du processus budgétaire évoqué pour Nopillo.

**1. La consolidation vivante (1 min 30).** Fenêtre CFO, dashboard FinCopilot : les cinq navettes soumises, le P&L mensuel N+1 reconstruit en direct, les KPIs (CA +40 %, breakeven en cours d'année, CAC moyen, runway). Trois alertes sorties toutes seules : SEA au-dessus du plafond de 515 € aux T1 et T2, NRR sous 100 % au T1. Ce sont exactement les seuils décidés en Sections 1 et 2 : la gouvernance proposée au codir est ici en production.

**2. Chacun chez soi (1 min).** Fenêtre privée, compte Head of Growth : il ne voit que sa navette, pas de consolidation, pas les autres départements. Sécurité par ligne dans la base, pas un filtre d'affichage.

**3. Un arbitrage en direct (2 min).** Côté Growth : créer une nouvelle version de la navette, gonfler les dépenses SEA, tenter une valeur négative : la soumission est refusée avec un message localisé (T par T). Corriger, soumettre. Côté CFO : recharger, le P&L bouge, l'alerte d'enveloppe apparaît. Principe énoncé à l'oral : une erreur de données bloque la consolidation, un dépassement de cadrage ne la bloque jamais, il se signale et s'arbitre.

**4. Le diff, la réalité d'une campagne (1 min).** Page Versions : Growth v1 vers v2 (l'arbitrage pré-chargé du seed) : lignes modifiées, impact +660 K€ d'EBITDA et de trésorerie. C'est la trace chiffrée de chaque aller-retour budgétaire.

**5. La gouvernance est une donnée (45 s).** Réglages : passer le plafond SEA de 515 à 560 €, recharger le dashboard : les alertes CAC disparaissent. Le cadrage codir est une configuration, pas du code.

**6. Réutilisabilité (1 min).** Déconnexion, `cfo@hexafloor.demo` : autre société, trois départements, autres drivers, autres seuils, même code. Son budget déclenche runway sous seuil de gel et trésorerie négative : l'outil dit "budget non finançable en l'état".

**7. Sous le capot et roadmap (45 s).** Terminal : `npm test`, 40 tests verts, calculs vérifiés à la main, aucun chiffre rédigé par IA. Roadmap : bridge budget vs réalisés (le pack de pilotage), workflow d'approbation, générateur de business case sur les mêmes conventions.

## Plans de secours

1. Démo nominale : application déployée sur Vercel (indépendante de ma machine).
2. Si le réseau de la salle est douteux : `npm run dev` en local, même base Supabase.
3. Si Supabase est injoignable : `npm run debug:seed` dans le terminal montre le moteur consolider les deux sociétés sans réseau, et la vidéo enregistrée de la démo prend le relais pour le portail.

Après tout passage de démonstration : rejouer `npm run seed` pour remettre les données à zéro.
