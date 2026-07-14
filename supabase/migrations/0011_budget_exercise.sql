-- Navette : demarrage d'un exercice budgetaire.
-- La direction ouvre la campagne : elle genere une navette v1 en brouillon pour chaque
-- departement, en mode top-down (elle pre-remplit, le metier ajuste ensuite) ou
-- bottom-up (chaque metier remplit la sienne). Elle peut aussi remettre l'exercice a zero.

-- 1. L'exercice budgetaire ----------------------------------------------------
-- Table dediee plutot qu'une colonne sur companies : cela evite d'ouvrir l'ecriture
-- du referentiel societe au CEO (les Reglages restent la chasse gardee du CFO).
create table public.budget_exercises (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year int not null,
  mode text not null check (mode in ('top_down', 'bottom_up')),
  started_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  unique (company_id, year)
);

alter table public.budget_exercises enable row level security;

create policy budget_exercises_select on public.budget_exercises for select
  using (company_id = my_company_id());

create policy budget_exercises_write on public.budget_exercises for all
  using (company_id = my_company_id() and my_role() in ('cfo', 'ceo'));

-- 2. Le CEO doit pouvoir ouvrir la campagne ------------------------------------
-- Jusqu'ici seuls le CFO et le Head of du departement pouvaient creer une navette :
-- le CEO ne pouvait donc pas demarrer l'exercice.
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert
  with check (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

-- 3. Remise a zero de l'exercice ------------------------------------------------
-- Il n'existait AUCUNE policy de suppression sur submissions : la suppression etait
-- donc refusee a tout le monde. Reservee au CFO et au CEO ; les lignes de navette
-- (classiques et libres) disparaissent par cascade.
create policy submissions_delete on public.submissions for delete
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and my_role() in ('cfo', 'ceo')
    )
  );
