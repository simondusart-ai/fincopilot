-- Navette : hypotheses de la simulation budgetaire pluriannuelle (memoire Section 2).
-- Une ligne par societe : croissance N+1/N+2/N+3, marge brute, croissance S&M (scenario A),
-- montant du S&M gele (scenario B), dotations (base + pas), tresorerie d'ouverture, ARR fin N,
-- ARPA mensuel, churn mensuel, base clients fin N, et la trajectoire trimestrielle de CAC
-- (rappel informatif, non calcule). Montants en K€ pour ce module, ARPA/CAC en €.
-- RLS : lecture CFO et CEO de la societe, ecriture CFO uniquement.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

create table public.simulation_assumptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  growth_n1 numeric not null,
  growth_n2 numeric not null,
  growth_n3 numeric not null,
  gross_margin_pct numeric not null,
  sm_growth numeric not null,
  sm_frozen_amount numeric not null,
  da_base numeric not null,
  da_step numeric not null,
  opening_cash numeric not null,
  arr_end_n numeric not null,
  arpa_monthly numeric not null,
  monthly_churn numeric not null,
  base_clients_end_n numeric not null,
  cac_trajectory jsonb not null default '[]'::jsonb
);

alter table public.simulation_assumptions enable row level security;

-- Lecture : membres CFO et CEO de la societe.
create policy simulation_assumptions_select on public.simulation_assumptions for select
  using (company_id = my_company_id() and my_role() in ('cfo', 'ceo'));

-- Ecriture (creation, modification, suppression) : CFO uniquement.
create policy simulation_assumptions_write on public.simulation_assumptions for all
  using (company_id = my_company_id() and my_role() = 'cfo')
  with check (company_id = my_company_id() and my_role() = 'cfo');
