-- Navette : realise du trimestre precedent (T4 de l'annee N) par poste.
-- La colonne existe deja sur submission_custom_lines (migration 0007) ; on l'ajoute
-- ici sur driver_defs pour que les lignes du referentiel puissent l'afficher aussi.
--
-- LIMITE ASSUMEE : ce champ n'est alimente par personne pour l'instant. L'historique
-- 2026 n'existe qu'au niveau societe (monthly_actuals), pas poste par poste : la
-- colonne "T4 2026 (realise)" s'affiche donc grisee et vide dans la navette.
-- Voir docs/DOCUMENTATION.md, section Limites.

alter table public.driver_defs add column prev_q4 numeric;
