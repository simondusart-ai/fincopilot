-- Navette : workflow de validation des navettes.
-- Une navette soumise peut etre validee (approved) ou renvoyee au metier (rejected)
-- par le CFO ou le CEO, avec un motif facultatif. Le metier ne peut pas se valider
-- lui-meme. Regle de consolidation : la derniere version soumise NON REJETEE fait foi.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

-- 1. Statuts et tracabilite de la decision ------------------------------------

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('draft', 'submitted', 'approved', 'rejected'));

alter table public.submissions
  add column decided_by uuid references auth.users(id),
  add column decided_at timestamptz,
  add column decision_note text;

-- 2. RLS : qui peut decider ---------------------------------------------------
-- USING porte sur la ligne AVANT modification, WITH CHECK sur la ligne APRES.
-- - le CFO administre les navettes de sa societe (comme avant) ;
-- - le CEO ne peut agir que sur une navette deja soumise (pour la decider) ;
-- - le Head of modifie la sienne, mais ne peut la porter qu'a brouillon ou soumise :
--   il ne peut donc jamais se valider lui-meme ni se renvoyer.

drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (
          my_role() = 'cfo'
          or (my_role() = 'ceo' and status = 'submitted')
          or d.id = my_department_id()
        )
    )
  )
  with check (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (
          my_role() in ('cfo', 'ceo')
          or (d.id = my_department_id() and status in ('draft', 'submitted'))
        )
    )
  );
