-- Navette : nouveaux types de drivers issus de l'itération sur le schéma cible.
-- payroll : masse salariale directe en euros par trimestre (lignes "ETP 1..n") ;
-- cogs : coût des ventes du département (la marge brute devient revenu - COGS déclarés) ;
-- revenue_other : revenus non récurrents (one-shot, prestations), hors MRR.

alter table public.driver_defs drop constraint driver_defs_kind_check;
alter table public.driver_defs add constraint driver_defs_kind_check
  check (kind in (
    'new_mrr', 'expansion_mrr', 'revenue_other',
    'headcount', 'payroll', 'opex', 'cogs',
    'channel_spend', 'channel_customers'
  ));
