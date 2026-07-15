-- Navette : le CEO peut ajuster le cadrage (enveloppes globales, plafonds de CAC).
-- Jusqu'ici departments et channels n'etaient modifiables que par le CFO (policies
-- departments_write / channels_write "for all", 0001). On AJOUTE au CEO le droit de
-- METTRE A JOUR ces deux tables (les policies existantes du CFO restent inchangees) ;
-- la creation et la suppression restent reservees au CFO. Cela permet de suivre une
-- recommandation du comite en changeant une enveloppe ou un plafond depuis l'ecran Budget,
-- sans ouvrir tout le referentiel au CEO. Les Reglages complets restent au CFO.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

create policy departments_update_ceo on public.departments for update
  using (company_id = my_company_id() and my_role() = 'ceo')
  with check (company_id = my_company_id() and my_role() = 'ceo');

create policy channels_update_ceo on public.channels for update
  using (company_id = my_company_id() and my_role() = 'ceo')
  with check (company_id = my_company_id() and my_role() = 'ceo');
