-- Navette : lignes libres saisies par le metier.
-- Le metier ne se limite plus au referentiel de drivers : il peut ajouter ses propres
-- postes (une ligne par ETP, un outil par fournisseur), avec leur type, leur frequence
-- de decaissement et un marqueur existant / nouveau. Ces lignes s'ajoutent aux lignes
-- classiques dans le total du departement, le diff et la consolidation.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

create table public.submission_custom_lines (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  -- Memes valeurs que driver_defs.kind, plus capex (reserve aux lignes libres).
  kind text not null check (kind in (
    'new_mrr', 'expansion_mrr', 'revenue_other', 'headcount', 'payroll',
    'opex', 'cogs', 'channel_spend', 'channel_customers', 'capex'
  )),
  label text not null,
  -- true : poste nouveau ; false : poste existant reconduit.
  is_new boolean not null default true,
  -- Fournisseur, pour les lignes d'outils et de depenses.
  vendor text,
  frequency text not null default 'trimestriel'
    check (frequency in ('mensuel', 'trimestriel', 'one_shot')),
  q1 numeric not null default 0,
  q2 numeric not null default 0,
  q3 numeric not null default 0,
  q4 numeric not null default 0,
  -- Realise du trimestre precedent (T4 de l'annee N). Non alimente pour l'instant :
  -- aucune donnee realisee par poste n'existe en 2026 (voir DOCUMENTATION.md, Limites).
  prev_q4 numeric,
  unique (submission_id, label)
);

-- RLS : identique a submission_lines. Lecture par les dirigeants et le Head of du
-- departement ; ecriture uniquement tant que la navette est en brouillon.
alter table public.submission_custom_lines enable row level security;

create policy submission_custom_lines_select on public.submission_custom_lines for select
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

create policy submission_custom_lines_write on public.submission_custom_lines for all
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and s.status = 'draft'
        and d.company_id = my_company_id()
        and (my_role() = 'cfo' or d.id = my_department_id())
    )
  );
