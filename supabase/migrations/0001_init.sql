-- Navette : schéma initial.
-- Toute la configuration société vit en base (jamais dans le code) : c'est ce qui rend
-- l'outil réutilisable dans une autre entreprise sans modifier une ligne de code.
-- Montants en euros, pourcentages en fractions (0.70 = 70 %).

create extension if not exists pgcrypto;

-- 1. Référentiel société ------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget_year int not null,
  opening_cash numeric not null,
  opening_mrr numeric not null default 0,
  arpa numeric not null,
  gross_margin_pct numeric not null check (gross_margin_pct > 0 and gross_margin_pct <= 1),
  monthly_churn_pct numeric not null check (monthly_churn_pct >= 0 and monthly_churn_pct < 1),
  runway_vigilance_months numeric not null default 18,
  runway_freeze_months numeric not null default 12,
  payback_cap_months numeric,
  -- Clés de mensualisation nommées : { "saison_fiscale": [12 coefficients janvier..décembre] }
  seasonal_keys jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  -- Enveloppe annuelle de cadrage codir, en euros. NULL = pas d'enveloppe.
  envelope numeric,
  is_sales_marketing boolean not null default false,
  sort int not null default 0,
  unique (company_id, code)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- Plafond de CAC décidé au codir, en euros. NULL = pas de plafond.
  cac_cap numeric,
  unique (company_id, name)
);

create table public.driver_defs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null,
  label text not null,
  kind text not null check (kind in ('new_mrr', 'expansion_mrr', 'headcount', 'opex', 'channel_spend', 'channel_customers')),
  channel_id uuid references public.channels(id) on delete restrict,
  monthly_key text,
  sort int not null default 0,
  unique (department_id, code),
  -- Un driver de canal doit référencer un canal ; les autres n'en ont pas.
  check ((kind in ('channel_spend', 'channel_customers')) = (channel_id is not null))
);

-- 2. Utilisateurs -------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- NULL pour le CFO (vision globale) ; renseigné pour un Head of.
  department_id uuid references public.departments(id) on delete set null,
  role text not null check (role in ('cfo', 'head_of')),
  full_name text not null
);

-- 3. Navettes -----------------------------------------------------------------

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_by uuid not null references auth.users(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (department_id, version)
);

create table public.submission_lines (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  driver_def_id uuid not null references public.driver_defs(id) on delete restrict,
  q1 numeric not null default 0,
  q2 numeric not null default 0,
  q3 numeric not null default 0,
  q4 numeric not null default 0,
  -- Pour les lignes effectifs : coût mensuel moyen chargé par ETP, en euros.
  unit_cost numeric,
  unique (submission_id, driver_def_id)
);

-- 4. Fonctions d'aide RLS (security definer pour éviter la récursion de policies)

create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = public as
$$ select company_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_department_id()
returns uuid language sql stable security definer set search_path = public as
$$ select department_id from public.profiles where user_id = auth.uid() $$;

-- 5. Row Level Security -------------------------------------------------------
-- Principe : chaque Head of ne voit et ne modifie que la navette de son département ;
-- le CFO voit tout et administre le référentiel de sa société.

alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.channels enable row level security;
alter table public.driver_defs enable row level security;
alter table public.profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_lines enable row level security;

-- Profils : chacun lit son profil ; le CFO lit ceux de sa société.
create policy profiles_select on public.profiles for select
  using (user_id = auth.uid() or (my_role() = 'cfo' and company_id = my_company_id()));

-- Société : lecture pour tous les membres, modification par le CFO.
create policy companies_select on public.companies for select
  using (id = my_company_id());
create policy companies_update on public.companies for update
  using (id = my_company_id() and my_role() = 'cfo');

-- Référentiel (départements, canaux, drivers) : lecture membres, écriture CFO.
create policy departments_select on public.departments for select
  using (company_id = my_company_id());
create policy departments_write on public.departments for all
  using (company_id = my_company_id() and my_role() = 'cfo');

create policy channels_select on public.channels for select
  using (company_id = my_company_id());
create policy channels_write on public.channels for all
  using (company_id = my_company_id() and my_role() = 'cfo');

create policy driver_defs_select on public.driver_defs for select
  using (exists (select 1 from public.departments d where d.id = department_id and d.company_id = my_company_id()));
create policy driver_defs_write on public.driver_defs for all
  using (
    my_role() = 'cfo'
    and exists (select 1 from public.departments d where d.id = department_id and d.company_id = my_company_id())
  );

-- Navettes : le Head of accède à son département, le CFO à toute la société.
create policy submissions_select on public.submissions for select
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (my_role() = 'cfo' or d.id = my_department_id())
    )
  );
create policy submissions_insert on public.submissions for insert
  with check (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (my_role() = 'cfo' or d.id = my_department_id())
    )
  );
-- Une navette n'est modifiable que tant qu'elle est en brouillon
-- (la soumission passe status à 'submitted', ce qui la fige).
create policy submissions_update on public.submissions for update
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (my_role() = 'cfo' or d.id = my_department_id())
    )
  );

create policy submission_lines_select on public.submission_lines for select
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and d.company_id = my_company_id()
        and (my_role() = 'cfo' or d.id = my_department_id())
    )
  );
create policy submission_lines_write on public.submission_lines for all
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
