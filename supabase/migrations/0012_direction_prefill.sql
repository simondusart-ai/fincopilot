-- Navette : la direction (CFO + CEO) pilote les navettes en top-down et simule un round.
-- Jusqu'ici le CEO ne pouvait qu'ouvrir la campagne (0011) et decider une navette deja
-- soumise (0006) : il ne pouvait ni pre-remplir une navette en brouillon, ni la soumettre.
-- On l'aligne sur le CFO pour l'ecriture des lignes et le passage brouillon -> soumise,
-- ce qui rend le top-down (la direction pre-remplit) et la simulation de round possibles.
-- Nouvelle migration numerotee : on ne modifie jamais une migration deja appliquee.

-- 1. Lignes classiques : le CEO peut ecrire celles d'une navette en brouillon ----------
drop policy if exists submission_lines_write on public.submission_lines;
create policy submission_lines_write on public.submission_lines for all
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and s.status = 'draft'
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

-- 2. Lignes libres : meme ouverture au CEO ---------------------------------------------
drop policy if exists submission_custom_lines_write on public.submission_custom_lines;
create policy submission_custom_lines_write on public.submission_custom_lines for all
  using (
    exists (
      select 1 from public.submissions s
      join public.departments d on d.id = s.department_id
      where s.id = submission_id
        and s.status = 'draft'
        and d.company_id = my_company_id()
        and (my_role() in ('cfo', 'ceo') or d.id = my_department_id())
    )
  );

-- 3. Soumission : la direction peut faire passer une navette de brouillon a soumise -----
-- Le CEO n'etait autorise (0006) qu'a agir sur une navette DEJA soumise ; on l'autorise
-- aussi a soumettre un brouillon, comme le CFO. Le WITH CHECK preserve la regle metier :
-- un Head of ne peut porter sa navette qu'a brouillon ou soumise (jamais se valider seul).
drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and d.company_id = my_company_id()
        and (
          my_role() in ('cfo', 'ceo')
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
