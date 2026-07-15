'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, btnSecondary, inputBase, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { SubmissionStatusBadge } from '@/components/navette-status-card';
import { businessCaseLines, computeBusinessCase, quartersFromAmount } from '@/lib/engine';
import type { DriverKind, LineFrequency } from '@/lib/engine';
import { fmtKEur } from '@/lib/format';
import type { DriverDefRow, SubmissionRow } from '@/lib/data';

/** Suggestions de fournisseurs pour les lignes d'outils et de dépenses. */
const VENDOR_SUGGESTIONS = [
  'Lemlist', 'LinkedIn Sales Navigator', 'Hubspot', 'Salesforce', 'Aircall',
  'Notion', 'Slack', 'Figma', 'AWS',
];

/** Pastille de type affichée par ligne (regroupement métier des kinds du moteur). */
const KIND_TYPE: Record<string, string> = {
  new_mrr: 'Revenu récurrent',
  expansion_mrr: 'Revenu récurrent',
  revenue_other: 'Revenu ponctuel',
  payroll: 'Salaires',
  headcount: 'Salaires',
  opex: 'Opex',
  channel_spend: 'Opex',
  cogs: 'COGS',
  capex: 'Capex',
  channel_customers: 'Volume',
};

const KIND_LABEL: Record<string, string> = {
  new_mrr: 'Nouveau MRR (€ / trimestre)',
  expansion_mrr: 'MRR d’expansion (€ / trimestre)',
  revenue_other: 'Revenus non récurrents (€ / trimestre)',
  headcount: 'Effectifs (ETP, niveau du trimestre)',
  payroll: 'Masse salariale (€ / trimestre)',
  opex: 'Dépenses (€ / trimestre)',
  cogs: 'Coût des ventes, COGS (€ / trimestre)',
  channel_spend: 'Dépenses du canal (€ / trimestre)',
  channel_customers: 'Nouveaux clients du canal (nb / trimestre)',
  capex: 'Investissement (€ / trimestre)',
};

/**
 * Sections de la navette : structure DÉDUITE du kind de chaque ligne, jamais codée
 * par département ni par société. Lignes du référentiel et lignes libres confondues.
 * Une section de coût compte dans le total du département ; la Topline en est exclue.
 */
type SectionId = 'topline' | 'acquisition' | 'payroll' | 'cogs' | 'opex';
interface SectionDef {
  id: SectionId;
  title: string;
  kinds: DriverKind[];
  isCost: boolean;
  /** Type des lignes libres que l'on peut ajouter ici. Absent = section non extensible. */
  addKind?: DriverKind;
  addLabel?: string;
  hasVendor?: boolean;
}
const SECTIONS: SectionDef[] = [
  { id: 'topline', title: 'Topline', kinds: ['new_mrr', 'expansion_mrr', 'revenue_other'], isCost: false },
  { id: 'acquisition', title: 'Acquisition par canal', kinds: ['channel_spend', 'channel_customers'], isCost: true },
  { id: 'payroll', title: 'Masse salariale', kinds: ['payroll', 'headcount'], isCost: true, addKind: 'payroll', addLabel: 'Ajouter un poste' },
  { id: 'cogs', title: 'COGS', kinds: ['cogs'], isCost: true },
  { id: 'opex', title: 'Opex et investissements', kinds: ['opex', 'capex'], isCost: true, addKind: 'opex', addLabel: 'Ajouter une dépense', hasVendor: true },
];

/** Ligne libre en cours d'édition. */
interface CustomEdit {
  id: string;
  kind: DriverKind;
  label: string;
  vendor: string;
  frequency: LineFrequency;
  isNew: boolean;
  /** Montant unitaire. Renseigné, il pilote les quatre trimestres, qui passent en lecture seule. */
  amount: string;
  /** Trimestre porteur d'un décaissement one_shot. */
  oneshotQuarter: string;
  /** Ordre d'affichage : une ligne ajoutée passe à la suite, jamais au milieu. */
  sort: number;
  q: [string, string, string, string];
  prevQ4: string;
}

interface EditLine {
  driverDefId: string;
  q: [string, string, string, string];
  unitCost: string;
}

function bcStatusBadge(status: string) {
  if (status === 'accepted') return <Badge tone="accent" dot="mint">Accepté</Badge>;
  if (status === 'rejected') return <Badge tone="danger">Rejeté</Badge>;
  return <Badge tone="muted">Proposé</Badge>;
}

const num = (v: string) => Number(v) || 0;
const fmtQ = (v: number) => Math.round(v).toLocaleString('fr-FR');

export default function NavettePage() {
  const { data, error, loading, reload } = usePortalData();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, EditLine>>({});
  const [customs, setCustoms] = useState<CustomEdit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const effectiveDeptId = deptId ?? data?.profile.department_id ?? data?.departments[0]?.id ?? null;
  const dept = data?.departments.find((d) => d.id === effectiveDeptId) ?? null;
  const defs = useMemo(
    () => (data?.driverDefs ?? []).filter((d) => d.department_id === effectiveDeptId),
    [data, effectiveDeptId],
  );
  const submissions = useMemo(
    () =>
      (data?.submissions ?? [])
        .filter((s) => s.department_id === effectiveDeptId)
        .sort((a, b) => b.version - a.version),
    [data, effectiveDeptId],
  );
  const latest: SubmissionRow | null = submissions[0] ?? null;
  const isDraft = latest?.status === 'draft';

  useEffect(() => {
    if (!data || !latest) {
      setEdit({});
      setCustoms([]);
      return;
    }
    setCustoms(
      data.customLines
        .filter((c) => c.submission_id === latest.id)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          vendor: c.vendor ?? '',
          frequency: c.frequency,
          isNew: c.is_new,
          amount: c.amount != null ? String(c.amount) : '',
          oneshotQuarter: c.oneshot_quarter != null ? String(c.oneshot_quarter) : '1',
          sort: Number(c.sort) || 0,
          q: [String(c.q1), String(c.q2), String(c.q3), String(c.q4)] as [string, string, string, string],
          prevQ4: c.prev_q4 != null ? String(c.prev_q4) : '',
        }))
        .sort((a, b) => a.sort - b.sort),
    );
    const byDef: Record<string, EditLine> = {};
    for (const def of defs) {
      const line = data.lines.find((l) => l.submission_id === latest.id && l.driver_def_id === def.id);
      byDef[def.id] = {
        driverDefId: def.id,
        q: line ? [String(line.q1), String(line.q2), String(line.q3), String(line.q4)] : ['0', '0', '0', '0'],
        unitCost: line?.unit_cost != null ? String(line.unit_cost) : '',
      };
    }
    setEdit(byDef);
  }, [data, latest, defs]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  const supabase = getSupabase();

  // Qui peut saisir cette navette : le CFO sur toute la societe, chaque metier sur la
  // sienne, et en exercice top-down la direction (CFO et CEO) pre-remplit n'importe
  // quelle navette avant de la rendre au metier. En bottom-up, le CEO ne pre-remplit pas.
  const isDirection = data.profile.role === 'cfo' || data.profile.role === 'ceo';
  const isTopDown = data.exercise?.mode === 'top_down';
  const canManage =
    data.profile.role === 'cfo' ||
    data.profile.department_id === effectiveDeptId ||
    (isTopDown && isDirection);
  const canArbitrate = data.profile.role === 'cfo' || data.profile.role === 'ceo';
  const canEditLines = isDraft && canManage;
  const prevQuarterLabel = `T4 ${data.company.budget_year - 1} (réalisé)`;

  // Business cases du département. Un cas ACCEPTÉ est converti en lignes libres par le
  // moteur (source de vérité unique, la même que la consolidation) : elles s'affichent
  // en lecture seule dans leur section et comptent dans les sous-totaux et le total.
  // Un business case impacte le département qui porte le projet ET celui qui porte
  // ses COGS (dépendance inter-métiers) : les deux voient la carte et les lignes.
  const deptBusinessCases = (data.businessCases ?? []).filter(
    (bc) => bc.target_department_id === effectiveDeptId || bc.cogs_department_id === effectiveDeptId,
  );
  const bcLines = (data.businessCases ?? [])
    .filter((bc) => bc.status === 'accepted' && bc.target_department_id)
    .flatMap((bc) =>
      businessCaseLines({
        id: bc.id,
        label: bc.label,
        targetDepartmentId: bc.target_department_id!,
        cogsDepartmentId: bc.cogs_department_id,
        params: bc.params,
      }),
    )
    .filter((l) => l.departmentId === effectiveDeptId);

  /**
   * Trimestres d'une ligne libre : déduits du montant s'il est renseigné (les T1-T4
   * passent alors en lecture seule), sinon saisis à la main (compatibilité).
   */
  const customQuarters = (c: CustomEdit): number[] =>
    c.amount.trim() !== ''
      ? [...quartersFromAmount(num(c.amount), c.frequency, Number(c.oneshotQuarter) || 1)]
      : c.q.map(num);

  /** Coût d'un trimestre pour une ligne du référentiel (un volume de clients n'est pas un coût). */
  const driverQuarterValue = (def: DriverDefRow, i: number): number => {
    const line = edit[def.id];
    if (!line) return 0;
    const v = num(line.q[i]);
    if (def.kind === 'headcount') return v * 3 * num(line.unitCost);
    if (def.kind === 'channel_customers') return 0;
    return v;
  };

  const sectionLines = (s: SectionDef) => ({
    drivers: defs.filter((d) => s.kinds.includes(d.kind)),
    customs: customs.filter((c) => s.kinds.includes(c.kind)),
    bcs: bcLines.filter((l) => s.kinds.includes(l.kind)),
  });

  /** Sous-total trimestriel d'une section (référentiel, lignes libres et business cases). */
  const sectionQuarters = (s: SectionDef): number[] => {
    const { drivers, customs: cs, bcs } = sectionLines(s);
    const out = [0, 0, 0, 0];
    for (const def of drivers) for (let i = 0; i < 4; i++) out[i] += driverQuarterValue(def, i);
    for (const c of cs) {
      const q = customQuarters(c);
      for (let i = 0; i < 4; i++) out[i] += q[i];
    }
    for (const l of bcs) for (let i = 0; i < 4; i++) out[i] += l.q[i];
    return out;
  };

  // Total du département = somme des sections de coût, Topline exclue.
  const annualCostEstimate = SECTIONS.filter((s) => s.isCost).reduce(
    (total, s) => total + sectionQuarters(s).reduce((a, b) => a + b, 0),
    0,
  );
  const overEnvelope = dept?.envelope != null && annualCostEstimate > Number(dept.envelope);
  const withinEnvelope = dept?.envelope != null && !overEnvelope;

  // Une section s'affiche si elle a des lignes ; les sections extensibles restent
  // toujours visibles pour que l'ajout soit possible dans TOUS les départements.
  const visibleSections = SECTIONS.filter((s) => {
    const { drivers, customs: cs, bcs } = sectionLines(s);
    return drivers.length + cs.length + bcs.length > 0 || s.addKind !== undefined;
  });

  function validateLocally(): string[] {
    const errs: string[] = [];
    for (const def of defs) {
      const line = edit[def.id];
      if (!line) continue;
      line.q.forEach((v, i) => {
        const n = Number(v);
        if (v.trim() === '' || !Number.isFinite(n)) errs.push(`${def.label}, T${i + 1} : valeur non numérique.`);
        else if (n < 0) errs.push(`${def.label}, T${i + 1} : valeur négative non admise.`);
      });
      if (def.kind === 'headcount') {
        const c = Number(line.unitCost);
        if (line.unitCost.trim() === '' || !Number.isFinite(c) || c < 0) {
          errs.push(`${def.label} : coût mensuel moyen par ETP manquant ou invalide.`);
        }
      }
    }
    const labels = new Set<string>();
    for (const c of customs) {
      const label = c.label.trim();
      if (label === '') errs.push('Une ligne libre a un libellé vide.');
      else if (labels.has(label)) errs.push(`Deux lignes libres portent le libellé "${label}".`);
      labels.add(label);
      if (c.amount.trim() !== '') {
        const a = Number(c.amount);
        if (!Number.isFinite(a)) errs.push(`${label || 'Ligne libre'} : montant non numérique.`);
        else if (a < 0) errs.push(`${label || 'Ligne libre'} : montant négatif non admis.`);
      } else {
        c.q.forEach((v, i) => {
          const n = Number(v);
          if (v.trim() === '' || !Number.isFinite(n)) errs.push(`${label || 'Ligne libre'}, T${i + 1} : valeur non numérique.`);
          else if (n < 0) errs.push(`${label || 'Ligne libre'}, T${i + 1} : valeur négative non admise.`);
        });
      }
    }
    return errs;
  }

  async function persistLines(submissionId: string) {
    const rows = defs.map((def) => {
      const line = edit[def.id];
      return {
        submission_id: submissionId,
        driver_def_id: def.id,
        q1: num(line?.q[0] ?? ''),
        q2: num(line?.q[1] ?? ''),
        q3: num(line?.q[2] ?? ''),
        q4: num(line?.q[3] ?? ''),
        unit_cost: def.kind === 'headcount' ? num(line?.unitCost ?? '') : null,
      };
    });
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('submission_lines')
      .upsert(rows, { onConflict: 'submission_id,driver_def_id' });
    if (error) throw new Error(error.message);
  }

  async function persistCustomLines(submissionId: string, copy = false) {
    if (customs.length === 0) return;
    const rows = customs.map((c) => {
      const q = customQuarters(c);
      return {
        ...(copy ? {} : { id: c.id }),
        submission_id: submissionId,
        kind: c.kind,
        label: c.label.trim(),
        is_new: c.isNew,
        vendor: c.vendor.trim() === '' ? null : c.vendor.trim(),
        frequency: c.frequency,
        amount: c.amount.trim() === '' ? null : num(c.amount),
        oneshot_quarter: c.frequency === 'one_shot' ? Number(c.oneshotQuarter) || 1 : null,
        sort: c.sort,
        q1: q[0],
        q2: q[1],
        q3: q[2],
        q4: q[3],
      };
    });
    const { error } = copy
      ? await supabase.from('submission_custom_lines').insert(rows)
      : await supabase.from('submission_custom_lines').upsert(rows);
    if (error) throw new Error(error.message);
  }

  async function addCustom(kind: DriverKind) {
    if (!latest) {
      setMessage('Aucune navette : créez d’abord la version v1.');
      return;
    }
    if (latest.status !== 'draft') {
      setMessage('Navette figée : créez une nouvelle version pour ajouter une ligne.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await persistCustomLines(latest.id);
      const base = kind === 'payroll' ? 'Nouveau poste' : 'Nouvelle dépense';
      const taken = new Set(customs.map((c) => c.label.trim()));
      let label = base;
      let n = 2;
      while (taken.has(label)) label = `${base} ${n++}`;
      const frequency: LineFrequency = kind === 'payroll' ? 'mensuel' : 'trimestriel';
      // La nouvelle ligne se place A LA SUITE des existantes, jamais au milieu.
      const nextSort = customs.reduce((max, c) => Math.max(max, c.sort), -1) + 1;
      const { error } = await supabase.from('submission_custom_lines').insert({
        submission_id: latest.id,
        kind,
        label,
        is_new: true,
        vendor: null,
        frequency,
        amount: null,
        oneshot_quarter: null,
        sort: nextSort,
        q1: 0, q2: 0, q3: 0, q4: 0,
      });
      if (error) throw new Error(error.message);
      setMessage(`Ligne "${label}" ajoutée.`);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom(id: string) {
    if (!latest || latest.status !== 'draft') {
      setMessage('Navette figée : créez une nouvelle version pour supprimer une ligne.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('submission_custom_lines').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createVersion() {
    if (!dept) return;
    setBusy(true);
    setMessage(null);
    try {
      const version = (latest?.version ?? 0) + 1;
      const { data: auth } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from('submissions')
        .insert({ department_id: dept.id, version, status: 'draft', created_by: auth.user!.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await persistLines((created as SubmissionRow).id);
      await persistCustomLines((created as SubmissionRow).id, true);
      setMessage(`Version v${version} créée en brouillon.`);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!latest) return;
    setBusy(true);
    setMessage(null);
    try {
      await persistLines(latest.id);
      await persistCustomLines(latest.id);
      setMessage('Brouillon enregistré.');
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitVersion() {
    if (!latest) return;
    const errs = validateLocally();
    setProblems(errs);
    if (errs.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await persistLines(latest.id);
      await persistCustomLines(latest.id);
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', latest.id);
      if (error) throw new Error(error.message);
      setMessage(`Navette v${latest.version} soumise : elle est figée et part en consolidation.`);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function decide(bcId: string, status: 'accepted' | 'rejected') {
    setBusy(true);
    setMessage(null);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('business_cases')
        .update({ status, decided_by: authUser.user!.id, decided_at: new Date().toISOString() })
        .eq('id', bcId);
      if (error) throw new Error(error.message);
      setMessage(`Business case ${status === 'accepted' ? 'accepté : intégré à la consolidation' : 'rejeté'}.`);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function decideSubmission(status: 'approved' | 'rejected') {
    if (!latest || latest.status !== 'submitted') return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('submissions')
        .update({
          status,
          decided_by: authUser.user!.id,
          decided_at: new Date().toISOString(),
          decision_note: note.trim() === '' ? null : note.trim(),
        })
        .eq('id', latest.id);
      if (error) throw new Error(error.message);
      setMessage(
        status === 'approved'
          ? `Navette v${latest.version} validée : elle reste consolidée.`
          : `Navette v${latest.version} renvoyée au métier : elle sort de la consolidation.`,
      );
      setNote('');
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const updateCustom = (id: string, patch: Partial<CustomEdit>) =>
    setCustoms((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateCustomQ = (id: string, i: number, v: string) =>
    setCustoms((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const q = [...c.q] as CustomEdit['q'];
        q[i] = v;
        return { ...c, q };
      }),
    );
  const updateDriverQ = (defId: string, i: number, v: string) =>
    setEdit((prev) => {
      const next = { ...prev };
      const l = { ...next[defId] };
      const q = [...l.q] as EditLine['q'];
      q[i] = v;
      l.q = q;
      next[defId] = l;
      return next;
    });

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

  const versionsAsc = [...submissions].sort((a, b) => a.version - b.version);
  const events: { key: string; badge: React.ReactNode; text: string; note?: string }[] = [];
  for (const s of versionsAsc) {
    if (s.status === 'draft') {
      events.push({ key: `${s.id}-d`, badge: <SubmissionStatusBadge status="draft" />, text: `v${s.version} en brouillon` });
      continue;
    }
    events.push({
      key: `${s.id}-s`,
      badge: <SubmissionStatusBadge status="submitted" />,
      text: s.submitted_at ? `v${s.version} soumise le ${fmtDate(s.submitted_at)}` : `v${s.version} soumise`,
    });
    if (s.status === 'approved') {
      events.push({
        key: `${s.id}-a`,
        badge: <SubmissionStatusBadge status="approved" />,
        text: s.decided_at ? `v${s.version} validée le ${fmtDate(s.decided_at)}` : `v${s.version} validée`,
        note: s.decision_note ?? undefined,
      });
    }
    if (s.status === 'rejected') {
      events.push({
        key: `${s.id}-r`,
        badge: <SubmissionStatusBadge status="rejected" />,
        text: s.decided_at ? `v${s.version} renvoyée le ${fmtDate(s.decided_at)}` : `v${s.version} renvoyée`,
        note: s.decision_note ?? undefined,
      });
    }
  }
  const canDecide = canArbitrate && latest?.status === 'submitted';

  return (
    <Page data={data}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Navette budgétaire {data.company.budget_year}</h1>
          <p className="mt-1 text-sm text-ink/60">
            Saisie trimestrielle par catégorie. Une fois soumise, la version est figée : toute modification passe par une nouvelle version.
          </p>
        </div>
        {(data.profile.role === 'cfo' || data.profile.role === 'ceo') && (
          <select value={effectiveDeptId ?? ''} onChange={(e) => setDeptId(e.target.value)} className={`bg-white ${inputBase}`}>
            {data.departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        )}
      </div>

      {!dept ? (
        <div className="mt-6"><ErrorBox message="Aucun département associé à votre profil : contactez le CFO." /></div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card title="Département" value={dept.name} />
            <Card
              title="Enveloppe globale"
              value={dept.envelope != null ? fmtKEur(Number(dept.envelope)) : 'Aucune'}
              hint="Fixée par le CFO dans Réglages ; un dépassement est signalé, jamais bloqué."
            />
            <Card
              title="Coût annuel saisi"
              value={fmtKEur(annualCostEstimate)}
              tone={overEnvelope ? 'bad' : 'default'}
              dot={withinEnvelope}
              hint={
                dept.envelope == null
                  ? 'Somme des sections de coût, Topline exclue.'
                  : overEnvelope
                    ? 'Somme des sections de coût, au-dessus de l’enveloppe globale.'
                    : 'Somme des sections de coût, dans l’enveloppe globale.'
              }
            />
          </div>

          {/* Suivi de la navette */}
          <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-ink">Suivi de la navette</h2>
              {latest && <Badge tone="muted">Version v{latest.version}</Badge>}
            </div>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-ink/60">Aucune version pour l’instant.</p>
            ) : (
              <ol className="mt-4 space-y-4 border-l border-lav pl-5">
                {events.map((e) => (
                  <li key={e.key} className="relative">
                    <span className="absolute -left-[23px] top-2 h-2 w-2 rounded-full bg-lav" />
                    <div className="flex flex-wrap items-center gap-2">
                      {e.badge}
                      <span className="text-sm text-ink">{e.text}</span>
                    </div>
                    {e.note && <p className="mt-1 text-sm italic text-ink/60">Motif : {e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
            {canManage && (
              <div className="mt-5 flex flex-wrap gap-2">
                {isDraft ? (
                  <>
                    <button onClick={saveDraft} disabled={busy} className={btnSecondary}>Enregistrer le brouillon</button>
                    <button onClick={submitVersion} disabled={busy} className={btnPrimary}>Soumettre la navette</button>
                  </>
                ) : (
                  <button onClick={createVersion} disabled={busy} className={btnPrimary}>
                    {latest ? `Nouvelle version (v${latest.version + 1})` : 'Créer la navette v1'}
                  </button>
                )}
              </div>
            )}
            {canManage && !isDraft && latest && (
              <p className="mt-3 text-xs text-ink/50">
                Navette figée : créez une nouvelle version pour modifier les lignes ou en ajouter.
              </p>
            )}
            {data.exercise && isDraft && (
              <p className="mt-3 text-xs text-ink/50">
                {data.exercise.mode === 'top_down'
                  ? 'Exercice top-down : la direction pré-remplit cette navette, le métier l’ajuste ensuite.'
                  : 'Exercice bottom-up : c’est au métier de remplir cette navette, puis de la soumettre.'}
              </p>
            )}
            {canDecide && (
              <div className="mt-5 border-t border-lav/60 pt-4">
                <p className="text-sm font-semibold text-ink">Décision sur la v{latest!.version} soumise</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motif (facultatif)" className={`w-72 bg-white ${inputBase}`} />
                  <button onClick={() => decideSubmission('approved')} disabled={busy} className={btnPrimary}>Valider</button>
                  <button onClick={() => decideSubmission('rejected')} disabled={busy} className={btnSecondary}>Renvoyer</button>
                </div>
              </div>
            )}
          </div>

          {problems.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Soumission refusée : corrigez d’abord ces points.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-600">
                {problems.map((p, i) => (<li key={i}>{p}</li>))}
              </ul>
            </div>
          )}

          <datalist id="vendor-suggestions">
            {VENDOR_SUGGESTIONS.map((v) => (<option key={v} value={v} />))}
          </datalist>

          {/* Sections par catégorie, déduites du kind des lignes */}
          {visibleSections.map((s) => {
            const { drivers, customs: cs, bcs } = sectionLines(s);
            const subtotal = sectionQuarters(s);
            const hasHeadcount = drivers.some((d) => d.kind === 'headcount');
            const extensible = s.addKind !== undefined;
            const empty = drivers.length + cs.length + bcs.length === 0;
            return (
              <div key={s.id} className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
                  <h2 className="font-semibold text-ink">{s.title}</h2>
                  {!s.isCost && <span className="text-xs text-ink/50">Hors total du département.</span>}
                  {/*
                    Le bouton reste VISIBLE des qu'on peut gerer la navette, et seulement
                    desactive quand elle est figee : c'etait la cause du bug (il n'etait
                    rendu qu'en brouillon, or toutes les navettes du seed sont soumises,
                    donc il n'apparaissait jamais).
                  */}
                  {extensible && canManage && (
                    <button
                      onClick={() => addCustom(s.addKind!)}
                      disabled={busy || !canEditLines}
                      title={canEditLines ? undefined : 'Navette figée : créez une nouvelle version pour ajouter une ligne.'}
                      className={`${btnSecondary} ml-auto`}
                    >
                      {s.addLabel}
                    </button>
                  )}
                </div>

                {empty ? (
                  <p className="p-5 text-sm text-ink/50">
                    Aucune ligne dans cette section.{extensible && !canEditLines ? ' Créez une nouvelle version pour en ajouter.' : ''}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="mt-3 w-full text-sm">
                      <thead>
                        <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                          <th className="px-5 py-3 font-semibold">Postes</th>
                          <th className="px-3 py-3 font-semibold">Type</th>
                          {s.hasVendor && <th className="px-3 py-3 font-semibold">Fournisseur</th>}
                          {extensible && <th className="px-3 py-3 font-semibold">Statut</th>}
                          {extensible && <th className="px-3 py-3 text-right font-semibold">Montant (€)</th>}
                          {extensible && <th className="px-3 py-3 font-semibold">Fréquence</th>}
                          <th className="px-3 py-3 text-right font-semibold">{prevQuarterLabel}</th>
                          <th className="px-3 py-3 text-right font-semibold">T1</th>
                          <th className="px-3 py-3 text-right font-semibold">T2</th>
                          <th className="px-3 py-3 text-right font-semibold">T3</th>
                          <th className="px-3 py-3 text-right font-semibold">T4</th>
                          {hasHeadcount && <th className="px-5 py-3 text-right font-semibold">Coût mensuel par ETP</th>}
                          {extensible && canEditLines && <th className="px-3 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Lignes du référentiel */}
                        {drivers.map((def) => (
                          <tr key={def.id} className="border-b border-lav/60">
                            <td className="px-5 py-2.5">
                              <p className="font-semibold text-ink">{def.label}</p>
                              <p className="text-xs text-ink/50">{KIND_LABEL[def.kind]}</p>
                            </td>
                            <td className="px-3 py-2.5"><Badge tone="muted">{KIND_TYPE[def.kind] ?? '-'}</Badge></td>
                            {s.hasVendor && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-right text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            <td className="px-3 py-2.5 text-right">
                              <input type="text" disabled readOnly value={def.prev_q4 != null ? String(def.prev_q4) : ''} className={`w-24 text-right ${inputBase}`} />
                            </td>
                            {[0, 1, 2, 3].map((i) => (
                              <td key={i} className="px-3 py-2.5 text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={!canEditLines}
                                  value={edit[def.id]?.q[i] ?? '0'}
                                  onChange={(e) => updateDriverQ(def.id, i, e.target.value)}
                                  className={`w-24 text-right ${inputBase}`}
                                />
                              </td>
                            ))}
                            {hasHeadcount && (
                              <td className="px-5 py-2.5 text-right">
                                {def.kind === 'headcount' ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={!canEditLines}
                                    value={edit[def.id]?.unitCost ?? ''}
                                    placeholder="ex. 7500"
                                    onChange={(e) => setEdit((prev) => ({ ...prev, [def.id]: { ...prev[def.id], unitCost: e.target.value } }))}
                                    className={`w-28 text-right ${inputBase}`}
                                  />
                                ) : (
                                  <span className="text-ink/30">-</span>
                                )}
                              </td>
                            )}
                            {extensible && canEditLines && <td />}
                          </tr>
                        ))}

                        {/* Lignes libres du métier */}
                        {cs.map((c) => (
                          <tr key={c.id} className="border-b border-lav/60">
                            <td className="px-5 py-2">
                              <input type="text" value={c.label} disabled={!canEditLines} onChange={(e) => updateCustom(c.id, { label: e.target.value })} className={`w-52 ${inputBase}`} />
                            </td>
                            <td className="px-3 py-2">
                              {s.hasVendor ? (
                                <select value={c.kind} disabled={!canEditLines} onChange={(e) => updateCustom(c.id, { kind: e.target.value as DriverKind })} className={`bg-white ${inputBase}`}>
                                  <option value="opex">Opex</option>
                                  <option value="capex">Capex</option>
                                </select>
                              ) : (
                                <Badge tone="muted">{KIND_TYPE[c.kind] ?? '-'}</Badge>
                              )}
                            </td>
                            {s.hasVendor && (
                              <td className="px-3 py-2">
                                <input type="text" list="vendor-suggestions" value={c.vendor} disabled={!canEditLines} placeholder="Fournisseur" onChange={(e) => updateCustom(c.id, { vendor: e.target.value })} className={`w-40 ${inputBase}`} />
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <select value={c.isNew ? 'new' : 'existing'} disabled={!canEditLines} onChange={(e) => updateCustom(c.id, { isNew: e.target.value === 'new' })} className={`bg-white ${inputBase}`}>
                                <option value="existing">Existant</option>
                                <option value="new">Nouveau</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={c.amount}
                                disabled={!canEditLines}
                                placeholder="ex. 5000"
                                title="Renseigné, il calcule les quatre trimestres. Vide, la saisie par trimestre reste possible."
                                onChange={(e) => updateCustom(c.id, { amount: e.target.value })}
                                className={`w-28 text-right ${inputBase}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <select value={c.frequency} disabled={!canEditLines} onChange={(e) => updateCustom(c.id, { frequency: e.target.value as LineFrequency })} className={`bg-white ${inputBase}`}>
                                  <option value="mensuel">Mensuel</option>
                                  <option value="trimestriel">Trimestriel</option>
                                  <option value="annuel">Annuel</option>
                                  <option value="one_shot">One shot</option>
                                </select>
                                {c.frequency === 'one_shot' && (
                                  <select value={c.oneshotQuarter} disabled={!canEditLines} onChange={(e) => updateCustom(c.id, { oneshotQuarter: e.target.value })} className={`bg-white ${inputBase}`}>
                                    {[1, 2, 3, 4].map((q) => (<option key={q} value={q}>T{q}</option>))}
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="text" disabled readOnly value={c.prevQ4} className={`w-24 text-right ${inputBase}`} />
                            </td>
                            {[0, 1, 2, 3].map((i) => {
                              const derived = c.amount.trim() !== '';
                              return (
                                <td key={i} className="px-3 py-2 text-right">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={derived ? fmtQ(customQuarters(c)[i]) : c.q[i]}
                                    disabled={!canEditLines || derived}
                                    readOnly={derived}
                                    title={derived ? 'Calculé à partir du montant et de la fréquence.' : undefined}
                                    onChange={(e) => updateCustomQ(c.id, i, e.target.value)}
                                    className={`w-24 text-right ${inputBase}`}
                                  />
                                </td>
                              );
                            })}
                            {hasHeadcount && <td className="px-5 py-2 text-right text-ink/30">-</td>}
                            {canEditLines && (
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => removeCustom(c.id)} disabled={busy} className="rounded-full border border-lav bg-white px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-card-soft">
                                  Supprimer
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}

                        {/* Lignes issues d'un business case accepté : lecture seule, taguées */}
                        {bcs.map((l) => (
                          <tr key={l.id} className="border-b border-lav/60 bg-card-soft">
                            <td className="px-5 py-2.5">
                              <p className="font-semibold text-ink">{l.label}</p>
                              <p className="text-xs text-ink/50">Ligne issue d’un business case accepté, non modifiable ici.</p>
                            </td>
                            <td className="px-3 py-2.5"><Badge tone="accent" dot="mint">Business case</Badge></td>
                            {s.hasVendor && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-right text-ink/30">-</td>}
                            {extensible && <td className="px-3 py-2.5 text-ink/30">-</td>}
                            <td className="px-3 py-2.5 text-ink/30 text-right">-</td>
                            {[0, 1, 2, 3].map((i) => (
                              <td key={i} className="px-3 py-2.5 text-right tabular-nums text-ink/70">{fmtQ(l.q[i])}</td>
                            ))}
                            {hasHeadcount && <td className="px-5 py-2.5 text-right text-ink/30">-</td>}
                            {extensible && canEditLines && <td />}
                          </tr>
                        ))}

                        {/* Sous-total de section */}
                        <tr className="bg-lav">
                          <td className="px-5 py-2 font-semibold">Sous-total {s.title.toLowerCase()}</td>
                          <td />
                          {s.hasVendor && <td />}
                          {extensible && <td />}
                          {extensible && <td />}
                          {extensible && <td />}
                          <td />
                          {subtotal.map((v, i) => (
                            <td key={i} className="px-3 py-2 text-right font-semibold tabular-nums">{fmtQ(v)}</td>
                          ))}
                          {hasHeadcount && <td />}
                          {extensible && canEditLines && <td />}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Business cases proposés sur ce département */}
          {deptBusinessCases.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-ink">Business cases proposés ({deptBusinessCases.length})</h2>
              <div className="mt-3 space-y-3">
                {deptBusinessCases.map((bc) => {
                  const res = computeBusinessCase(bc.params);
                  const y1 = res.years[0];
                  const targetName = data.departments.find((d) => d.id === bc.target_department_id)?.name ?? '-';
                  const cogsName = data.departments.find((d) => d.id === bc.cogs_department_id)?.name ?? targetName;
                  // Ce que CE département porte : le projet, ou seulement les COGS.
                  const isCogsBearer = bc.cogs_department_id === effectiveDeptId && bc.target_department_id !== effectiveDeptId;
                  // Ce que CE département porte : soit les COGS seuls, soit le projet
                  // (revenus d'un côté, coûts de l'autre : un projet n'est pas que du coût).
                  const cogsIci = !bc.cogs_department_id || bc.cogs_department_id === effectiveDeptId ? y1?.recurringCosts ?? 0 : 0;
                  const coutsPortes = isCogsBearer
                    ? (y1?.recurringCosts ?? 0)
                    : (y1?.salaries ?? 0) + (y1?.otherOpex ?? 0) + (y1?.investment ?? 0) + cogsIci;
                  const revenusPortes = isCogsBearer ? 0 : y1?.revenue ?? 0;
                  const suffix = bc.status === 'accepted' ? ' (compté)' : bc.status === 'rejected' ? ' (écarté)' : ' (si accepté)';
                  return (
                    <div key={bc.id} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-ink">{bc.label}</span>
                        {bcStatusBadge(bc.status)}
                        {isCogsBearer && <Badge tone="peach">COGS pour {targetName}</Badge>}
                        <span className="text-xs text-ink/50">
                          Année 1 sur ce département :{revenusPortes > 0 ? ` revenus ${fmtKEur(revenusPortes)},` : ''} coûts {fmtKEur(coutsPortes)}{suffix}
                        </span>
                      </div>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-primary">Voir le détail du business case</summary>
                        <div className="mt-3 text-sm text-ink/70">
                          <p>
                            Porté par <span className="font-semibold text-ink">{targetName}</span> ; COGS portés par{' '}
                            <span className="font-semibold text-ink">{cogsName}</span>. VAN {fmtKEur(res.npv)}, payback{' '}
                            {res.paybackMonths === null ? 'non atteint' : `${res.paybackMonths.toFixed(1)} mois`}, cash-flow cumulé {fmtKEur(res.totalCashFlow)}.
                          </p>
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                                  <th className="px-3 py-2 font-semibold">Ligne (k€)</th>
                                  {res.years.map((y) => (<th key={y.year} className="px-3 py-2 text-right font-semibold">A{y.year}</th>))}
                                </tr>
                              </thead>
                              <tbody>
                                {([
                                  ['Revenus', (y: typeof res.years[0]) => y.revenue],
                                  ['COGS (coûts récurrents)', (y: typeof res.years[0]) => -y.recurringCosts],
                                  ['Salaires', (y: typeof res.years[0]) => -y.salaries],
                                  ['Autres opex', (y: typeof res.years[0]) => -y.otherOpex],
                                  ['Invest', (y: typeof res.years[0]) => -y.investment],
                                  ['Cash-flow', (y: typeof res.years[0]) => y.cashFlow],
                                ] as [string, (y: typeof res.years[0]) => number][]).map(([lbl, get]) => (
                                  <tr key={lbl} className="border-b border-lav/60">
                                    <td className="px-3 py-1.5">{lbl}</td>
                                    {res.years.map((y) => {
                                      const v = get(y);
                                      return (
                                        <td key={y.year} className={`px-3 py-1.5 text-right tabular-nums ${v < 0 ? 'text-red-600' : ''}`}>
                                          {Math.round(v / 1000).toLocaleString('fr-FR')}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </details>

                      {canArbitrate && (
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => decide(bc.id, 'accepted')} disabled={busy || bc.status === 'accepted'} className={btnPrimary}>Accepter</button>
                          <button onClick={() => decide(bc.id, 'rejected')} disabled={busy || bc.status === 'rejected'} className={btnSecondary}>Rejeter</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && <p className="mt-4 text-sm text-ink/70">{message}</p>}
        </>
      )}
    </Page>
  );
}
