-- Navette : historisation des exercices realises (actuals) et cibles de pilotage.
-- Ajoute la base clients d'ouverture et une cible de CAC moyen sur les societes,
-- plus trois tables d'historique : P&L annuel, indicateurs mensuels, detail par canal.
-- Montants en euros, pourcentages en fractions (0.70 = 70 %). Nouvelle migration
-- numerotee : on ne modifie jamais une migration deja appliquee.

-- 1. Societe : base clients d'ouverture et cible de CAC moyen ------------------

alter table public.companies
  add column opening_clients numeric not null default 0,
  add column cac_avg_target numeric;

-- 2. P&L annuel realise -------------------------------------------------------
-- Structure de l'Annexe A (valeurs en euros). Une ligne par exercice historise.

create table public.pnl_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year int not null,
  revenue numeric not null default 0,
  sm numeric not null default 0,
  tech_product numeric not null default 0,
  payroll_other numeric not null default 0,
  ga numeric not null default 0,
  ebitda numeric not null default 0,
  da numeric not null default 0,
  net_income numeric not null default 0,
  unique (company_id, year)
);

-- 3. Indicateurs mensuels realises -------------------------------------------
-- Une donnee manquante reste NULL : le pilotage affiche une case vide, jamais une erreur.

create table public.monthly_actuals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  new_clients numeric not null default 0,
  churned_clients numeric not null default 0,
  mrr_end numeric not null default 0,
  -- Chiffre d'affaires du mois si connu, sinon NULL (on retombe sur le MRR de fin de mois).
  revenue_month numeric,
  sm_spend numeric not null default 0,
  -- Tresorerie de fin de mois si connue, sinon NULL (pas de burn ni de runway calculables).
  cash_end numeric,
  -- NRR mesure (fraction) si disponible, sinon NULL (le moteur calcule un proxy).
  nrr_measured numeric,
  unique (company_id, year, month)
);

-- 4. Detail des canaux d'acquisition realise ---------------------------------

create table public.channel_actuals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  spend numeric not null default 0,
  new_customers numeric not null default 0,
  unique (channel_id, year, month)
);

-- 5. Row Level Security -------------------------------------------------------
-- Meme principe que la migration 0001 : lecture pour tous les membres de la
-- societe, ecriture reservee au CFO. Les helpers my_company_id() et my_role()
-- sont ceux definis dans 0001.

alter table public.pnl_years enable row level security;
alter table public.monthly_actuals enable row level security;
alter table public.channel_actuals enable row level security;

create policy pnl_years_select on public.pnl_years for select
  using (company_id = my_company_id());
create policy pnl_years_write on public.pnl_years for all
  using (company_id = my_company_id() and my_role() = 'cfo');

create policy monthly_actuals_select on public.monthly_actuals for select
  using (company_id = my_company_id());
create policy monthly_actuals_write on public.monthly_actuals for all
  using (company_id = my_company_id() and my_role() = 'cfo');

create policy channel_actuals_select on public.channel_actuals for select
  using (company_id = my_company_id());
create policy channel_actuals_write on public.channel_actuals for all
  using (company_id = my_company_id() and my_role() = 'cfo');
