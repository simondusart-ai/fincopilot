-- Navette : objectif de churn saisi en navette (kind churn_rate).
-- Un metier (Ops / CS) peut fixer le churn mensuel cible, niveau trimestriel exprime en %
-- par mois (1,3 = 1,3 %/mois). Le moteur l'utilise comme taux de churn effectif s'il existe,
-- sinon il retombe sur le taux de la configuration. On etend donc le check des kinds de
-- driver_defs avec 'churn_rate'. Les lignes libres ne sont pas concernees : churn_rate est un
-- driver du referentiel (un niveau, comme les effectifs), jamais une ligne libre.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

alter table public.driver_defs drop constraint driver_defs_kind_check;
alter table public.driver_defs add constraint driver_defs_kind_check
  check (kind in (
    'new_mrr', 'expansion_mrr', 'revenue_other',
    'headcount', 'payroll', 'opex', 'cogs',
    'channel_spend', 'channel_customers', 'churn_rate'
  ));
