# Navette

Portail de campagne budgétaire : chaque Head of construit sa navette (objectifs et moyens par trimestre), la finance consolide en continu un P&L mensuel, les contributions par département et les alertes par rapport au cadrage du comité de direction.

- **Documentation courte** (objectif, mode d'emploi, conventions de calcul, limites, pistes d'adaptation) : [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)
- **Déroulé de démonstration** : [`docs/DEMO.md`](docs/DEMO.md)

## Démarrage rapide

```bash
npm install
# migrations supabase/migrations/*.sql dans l'éditeur SQL Supabase
# .env.example -> .env.local (URL + clé publique du projet)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
npm run dev
```

Comptes de démonstration : `cfo@fincopilot.demo` (mot de passe `Navette-demo-2026`), voir la sortie du seed pour la liste complète.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (localhost:3000) |
| `npm test` | suite de tests du moteur (Vitest) |
| `npm run seed` | remise à zéro des données de démonstration (clé service_role requise) |
| `npm run debug:seed` | consolidation des données de démo dans le terminal, sans base ni front |
| `npm run build` | build de production |

## Structure

```
src/lib/engine/     moteur de consolidation (TypeScript pur, testé) : le coeur du skill
src/lib/seed-data.ts  données de démonstration (FinCopilot, Hexafloor)
src/app/            portail Next.js (login, navette, consolidation, versions, réglages)
supabase/migrations schéma Postgres + politiques RLS
scripts/            seed et debug
```
