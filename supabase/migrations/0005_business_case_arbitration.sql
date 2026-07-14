-- Navette : arbitrage des business cases et introduction du role CEO.
-- Un business case cible un departement, porte un statut (propose / accepte / rejete)
-- et est arbitre par le CFO ou le CEO. Nouvelle migration numerotee.

-- 1. Role CEO ------------------------------------------------------------------
-- Le CEO lit tout dans sa societe (comme le CFO) et arbitre, mais n'edite pas le
-- referentiel (Reglages reste reserve au CFO).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('cfo', 'head_of', 'ceo'));

-- 2. Business cases : cible et arbitrage --------------------------------------
alter table public.business_cases
  add column target_department_id uuid references public.departments(id) on delete set null,
  add column status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  add column decided_by uuid references auth.users(id),
  add column decided_at timestamptz;

-- 3. RLS : etendre l'acces en lecture des dirigeants (CFO et CEO) --------------
-- On recree les policies de lecture qui gataient l'acces au niveau CFO.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (user_id = auth.uid() or (my_role() in ('cfo', 'ceo') and company_id = my_company_id()));

drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

drop policy if exists submission_lines_select on public.submission_lines;
create policy submission_lines_select on public.submission_lines for select
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

-- 4. RLS : arbitrage des business cases par le CFO et le CEO -------------------
-- Lecture (business_cases_select de 0004) : deja ouverte a tous les membres.
drop policy if exists business_cases_update on public.business_cases;
create policy business_cases_update on public.business_cases for update
  using (company_id = my_company_id() and (created_by = auth.uid() or my_role() in ('cfo', 'ceo')));

drop policy if exists business_cases_delete on public.business_cases;
create policy business_cases_delete on public.business_cases for delete
  using (company_id = my_company_id() and (created_by = auth.uid() or my_role() in ('cfo', 'ceo')));
