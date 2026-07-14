-- Navette : ordre des lignes libres, et departement porteur des COGS d'un business case.

-- 1. Ordre d'affichage des lignes libres ---------------------------------------
-- Sans ordre explicite, les lignes remontaient triees par libelle : une ligne
-- ajoutee s'inserait au milieu de la liste. Elles s'ajoutent desormais a la suite.
alter table public.submission_custom_lines add column sort int not null default 0;

-- 2. Dependance inter-metiers d'un business case -------------------------------
-- Les couts recurrents d'un business case sont des COGS : ils peuvent etre portes
-- par un AUTRE departement que celui qui porte les salaires et les opex (typiquement
-- Ops / CS qui produit le service vendu). NULL = portes par le departement cible.
alter table public.business_cases
  add column cogs_department_id uuid references public.departments(id) on delete set null;
