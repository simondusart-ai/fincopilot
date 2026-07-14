-- Navette : business cases (projets d'investissement) rattaches a une societe.
-- Les hypotheses sont stockees en jsonb (params du moteur computeBusinessCase) ;
-- les resultats (VAN, payback, flux) sont recalcules a l'affichage, jamais figes.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

create table public.business_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Departement rattache (celui du Head of createur) ; NULL pour un cas transverse ou CFO.
  department_id uuid references public.departments(id) on delete set null,
  label text not null,
  params jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Row Level Security : lecture pour tous les membres de la societe, ecriture par le
-- createur ; le CFO gere (modifie, supprime) tous les cas de sa societe.
-- Helpers my_company_id() et my_role() definis dans la migration 0001.
alter table public.business_cases enable row level security;

create policy business_cases_select on public.business_cases for select
  using (company_id = my_company_id());

create policy business_cases_insert on public.business_cases for insert
  with check (company_id = my_company_id() and created_by = auth.uid());

create policy business_cases_update on public.business_cases for update
  using (company_id = my_company_id() and (created_by = auth.uid() or my_role() = 'cfo'));

create policy business_cases_delete on public.business_cases for delete
  using (company_id = my_company_id() and (created_by = auth.uid() or my_role() = 'cfo'));
