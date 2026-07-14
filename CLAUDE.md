@AGENTS.md

# Navette : contexte projet

Portail de campagne budgétaire (skill test Nopillo, Section 3, puis usage réel). Chaque Head of saisit sa navette par trimestre ; le moteur consolide un P&L mensuel, les contributions par département et les alertes vs cadrage codir. Lire `docs/DOCUMENTATION.md` (conventions de calcul, limites) avant toute évolution du moteur, et `docs/DEMO.md` avant de toucher aux données de démonstration.

## Commandes

- `npm run dev` : serveur local (localhost:3000)
- `npm test` : suite Vitest du moteur ; DOIT rester verte, c'est le contrat
- `npm run seed` : remise à zéro des données de démo (variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises)
- `npm run debug:seed` : consolidation des données de démo en console, sans base
- `npm run build` : build de production (à vérifier avant tout push)

## Architecture, à respecter strictement

- `src/lib/engine/` : moteur de consolidation, TypeScript PUR. Interdiction d'y importer Supabase, Next ou quoi que ce soit d'externe. Toute évolution du moteur commence par un test.
- La configuration société (départements, drivers, enveloppes, plafonds CAC, seuils runway, ARPA, churn, clés saisonnières) vit en base, JAMAIS en dur dans le code. Aucune valeur propre à FinCopilot ou à une société réelle dans `src/`.
- Distinction non négociable : contrôle bloquant = intégrité des données (le moteur refuse de consolider) ; alerte = règle de gestion dépassée (on consolide et on signale). Ne jamais transformer l'un en l'autre.
- Sécurité par RLS dans `supabase/migrations/` : chaque Head of ne voit que son département, le CFO tout ; une navette soumise est figée. Toute nouvelle table doit avoir ses policies.
- Schéma : toute modification passe par un NOUVEAU fichier de migration numéroté (jamais éditer une migration déjà appliquée).

## Règles d'écriture, impératives

- INTERDICTION ABSOLUE du tiret cadratin (caractère U+2014) dans tous les textes, y compris messages d'alerte, UI et docs. Vérifier avant tout commit : `grep -rn $'—' src docs scripts supabase README.md`. Remplacements : deux-points, virgule, parenthèses, point-virgule ou tiret simple.
- Textes UI et messages en français, style sobre et factuel, sans emphase.
- Montants en euros (pas de K€ dans les données), pourcentages en fractions (0.70 = 70 %).
- Aucun chiffre rédigé par IA dans les sorties : les alertes et synthèses sont des constats calculés par le moteur.
- Ne jamais mélanger des chiffres réels de Nopillo avec les données fictives FinCopilot/Hexafloor.

## Données de démonstration

`src/lib/seed-data.ts` est la source de vérité (utilisée par le script de seed ET par les tests de cohérence `seed.test.ts` qui verrouillent le rebouclage avec les Sections 1-2 du skill test : CA ~+40 %, EBITDA positif, CAC < 515 €, alertes SEA T1-T2). Si un chiffre de seed change, ces tests disent si l'histoire tient toujours. Comptes : cfo@fincopilot.demo etc., mot de passe Navette-demo-2026.

## Secrets

`.env.local` (clé publique) ne se commit pas. La clé service_role ne s'écrit nulle part dans le repo : uniquement en variable d'environnement au moment du seed.
