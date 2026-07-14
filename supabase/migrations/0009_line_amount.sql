-- Navette : montant unitaire et frequence de decaissement sur les lignes libres.
-- Le metier saisit UN montant et une frequence ; les quatre trimestres en decoulent.
--
-- NOTE : la specification parlait de "migration 0007", mais 0007 (lignes libres) et
-- 0008 (prev_q4) sont deja appliquees et ne se modifient jamais. Cette migration
-- porte donc le numero suivant libre.

alter table public.submission_custom_lines
  add column amount numeric,
  add column oneshot_quarter int check (oneshot_quarter between 1 and 4);

-- La frequence accepte desormais 'annuel' (montant annuel reparti en quatre trimestres).
alter table public.submission_custom_lines
  drop constraint if exists submission_custom_lines_frequency_check;
alter table public.submission_custom_lines
  add constraint submission_custom_lines_frequency_check
  check (frequency in ('mensuel', 'trimestriel', 'annuel', 'one_shot'));
