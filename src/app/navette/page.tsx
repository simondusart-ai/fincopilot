'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, btnSecondary, inputBase, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { computeBusinessCase } from '@/lib/engine';
import type { DriverKind, LineFrequency } from '@/lib/engine';
import { fmtKEur } from '@/lib/format';
import type { DriverDefRow, SubmissionRow } from '@/lib/data';

/** Suggestions de fournisseurs pour les lignes d'outils et de dépenses. */
const VENDOR_SUGGESTIONS = [
  'Lemlist', 'LinkedIn Sales Navigator', 'Hubspot', 'Salesforce', 'Aircall',
  'Notion', 'Slack', 'Figma', 'AWS',
];

/** Ligne libre en cours d'édition. */
interface CustomEdit {
  id: string;
  kind: DriverKind;
  label: string;
  vendor: string;
  frequency: LineFrequency;
  isNew: boolean;
  q: [string, string, string, string];
  /** Réalisé du trimestre précédent, en lecture seule (non alimenté pour l'instant). */
  prevQ4: string;
}

function statusBadge(status: string) {
  if (status === 'accepted') return <Badge tone="accent" dot="mint">Accepté</Badge>;
  if (status === 'rejected') return <Badge tone="danger">Rejeté</Badge>;
  return <Badge tone="muted">Proposé</Badge>;
}

/** Pastille de type affichee par ligne (regroupement metier des kinds du moteur). */
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
  // channel_customers n'est pas un poste de coût ni de revenu : c'est un volume de clients.
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
};

interface EditLine {
  driverDefId: string;
  q: [string, string, string, string];
  unitCost: string;
}

export default function NavettePage() {
  const { data, error, loading, reload } = usePortalData();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, EditLine>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [customs, setCustoms] = useState<CustomEdit[]>([]);

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

  // Initialise la grille d'édition depuis la dernière version.
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
          q: [String(c.q1), String(c.q2), String(c.q3), String(c.q4)] as [string, string, string, string],
          prevQ4: c.prev_q4 != null ? String(c.prev_q4) : '',
        })),
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

  /** Estimation locale du coût annuel de la navette (indicatif, avant consolidation). */
  const driverCostEstimate = defs.reduce((total, def) => {
    const line = edit[def.id];
    if (!line) return total;
    const qs = line.q.map((v) => Number(v) || 0);
    const s = qs.reduce((a, b) => a + b, 0);
    if (def.kind === 'headcount') return total + s * 3 * (Number(line.unitCost) || 0);
    if (def.kind === 'payroll' || def.kind === 'opex' || def.kind === 'cogs' || def.kind === 'channel_spend') return total + s;
    return total;
  }, 0);
  // Les lignes libres de coût (salaires, opex, capex) comptent dans le total du département.
  const customCostEstimate = customs.reduce((total, c) => {
    if (c.kind !== 'payroll' && c.kind !== 'opex' && c.kind !== 'capex' && c.kind !== 'cogs') return total;
    return total + c.q.reduce((a, v) => a + (Number(v) || 0), 0);
  }, 0);
  const annualCostEstimate = driverCostEstimate + customCostEstimate;

  const overEnvelope = dept?.envelope != null && annualCostEstimate > Number(dept.envelope);
  const withinEnvelope = dept?.envelope != null && !overEnvelope;

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
    // Lignes libres : libellé non vide, unique, et valeurs numériques positives.
    const labels = new Set<string>();
    for (const c of customs) {
      const label = c.label.trim();
      if (label === '') errs.push('Une ligne libre a un libellé vide.');
      else if (labels.has(label)) errs.push(`Deux lignes libres portent le libellé "${label}".`);
      labels.add(label);
      c.q.forEach((v, i) => {
        const n = Number(v);
        if (v.trim() === '' || !Number.isFinite(n)) errs.push(`${label || 'Ligne libre'}, T${i + 1} : valeur non numérique.`);
        else if (n < 0) errs.push(`${label || 'Ligne libre'}, T${i + 1} : valeur négative non admise.`);
      });
    }
    return errs;
  }

  async function persistLines(submissionId: string) {
    const rows = defs.map((def) => {
      const line = edit[def.id];
      return {
        submission_id: submissionId,
        driver_def_id: def.id,
        q1: Number(line?.q[0]) || 0,
        q2: Number(line?.q[1]) || 0,
        q3: Number(line?.q[2]) || 0,
        q4: Number(line?.q[3]) || 0,
        unit_cost: def.kind === 'headcount' ? Number(line?.unitCost) || 0 : null,
      };
    });
    const { error } = await supabase
      .from('submission_lines')
      .upsert(rows, { onConflict: 'submission_id,driver_def_id' });
    if (error) throw new Error(error.message);
  }

  /**
   * Persiste les lignes libres. `copy` = true pour recopier les lignes dans une
   * NOUVELLE version (nouveaux identifiants) ; sinon on met a jour les lignes existantes.
   */
  async function persistCustomLines(submissionId: string, copy = false) {
    if (customs.length === 0) return;
    const rows = customs.map((c) => ({
      ...(copy ? {} : { id: c.id }),
      submission_id: submissionId,
      kind: c.kind,
      label: c.label.trim(),
      is_new: c.isNew,
      vendor: c.vendor.trim() === '' ? null : c.vendor.trim(),
      frequency: c.frequency,
      q1: Number(c.q[0]) || 0,
      q2: Number(c.q[1]) || 0,
      q3: Number(c.q[2]) || 0,
      q4: Number(c.q[3]) || 0,
    }));
    const { error } = copy
      ? await supabase.from('submission_custom_lines').insert(rows)
      : await supabase.from('submission_custom_lines').upsert(rows);
    if (error) throw new Error(error.message);
  }

  async function addCustom(kind: DriverKind) {
    if (!latest || latest.status !== 'draft') return;
    setBusy(true);
    setMessage(null);
    try {
      await persistCustomLines(latest.id); // ne pas perdre les saisies en cours
      const base = kind === 'payroll' ? 'Nouveau poste' : 'Nouvelle dépense';
      const taken = new Set(customs.map((c) => c.label.trim()));
      let label = base;
      let n = 2;
      while (taken.has(label)) label = `${base} ${n++}`;
      const frequency: LineFrequency = kind === 'payroll' ? 'mensuel' : kind === 'capex' ? 'one_shot' : 'trimestriel';
      const { error } = await supabase.from('submission_custom_lines').insert({
        submission_id: latest.id,
        kind,
        label,
        is_new: true,
        vendor: null,
        frequency,
        q1: 0, q2: 0, q3: 0, q4: 0,
      });
      if (error) throw new Error(error.message);
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom(id: string) {
    if (!latest || latest.status !== 'draft') return;
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
      await persistCustomLines((created as SubmissionRow).id, true); // recopie les lignes libres
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

  // La colonne du coût par ETP n'a de sens que si le département a une ligne effectifs.
  const hasHeadcount = defs.some((d) => d.kind === 'headcount');

  // Colonne du trimestre précédent : affichée grisée, non alimentée pour l'instant.
  const prevQuarterLabel = `T4 ${data.company.budget_year - 1} (réalisé)`;

  // Droits : le CFO gère toute navette, un Head of la sienne ; le CEO consulte et arbitre.
  const canManage = data.profile.role === 'cfo' || data.profile.department_id === effectiveDeptId;
  const canArbitrate = data.profile.role === 'cfo' || data.profile.role === 'ceo';
  const deptBusinessCases = (data.businessCases ?? []).filter((bc) => bc.target_department_id === effectiveDeptId);
  const acceptedBcAnnual = deptBusinessCases
    .filter((bc) => bc.status === 'accepted')
    .reduce((sum, bc) => { const y1 = computeBusinessCase(bc.params).years[0]; return sum + (y1 ? y1.salaries + y1.otherOpex : 0); }, 0);

  // Lignes libres : édition réservée au brouillon, par le CFO ou le Head of du département.
  const canEditLines = isDraft && canManage;
  const payrollCustoms = customs.filter((c) => c.kind === 'payroll');
  const toolCustoms = customs.filter((c) => c.kind === 'opex' || c.kind === 'capex');

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

  function customRow(c: CustomEdit, withVendor: boolean) {
    return (
      <tr key={c.id} className="border-b border-lav/60 last:border-0">
        <td className="px-5 py-2">
          <input
            type="text"
            value={c.label}
            disabled={!canEditLines}
            onChange={(e) => updateCustom(c.id, { label: e.target.value })}
            className={`w-52 ${inputBase}`}
          />
        </td>
        {withVendor && (
          <>
            <td className="px-3 py-2">
              <input
                type="text"
                list="vendor-suggestions"
                value={c.vendor}
                disabled={!canEditLines}
                placeholder="Fournisseur"
                onChange={(e) => updateCustom(c.id, { vendor: e.target.value })}
                className={`w-44 ${inputBase}`}
              />
            </td>
            <td className="px-3 py-2">
              <select
                value={c.kind}
                disabled={!canEditLines}
                onChange={(e) => updateCustom(c.id, { kind: e.target.value as DriverKind })}
                className={`bg-white ${inputBase}`}
              >
                <option value="opex">Opex</option>
                <option value="capex">Capex</option>
              </select>
            </td>
          </>
        )}
        <td className="px-3 py-2">
          <select
            value={c.isNew ? 'new' : 'existing'}
            disabled={!canEditLines}
            onChange={(e) => updateCustom(c.id, { isNew: e.target.value === 'new' })}
            className={`bg-white ${inputBase}`}
          >
            <option value="existing">Existant</option>
            <option value="new">Nouveau</option>
          </select>
        </td>
        <td className="px-3 py-2">
          <select
            value={c.frequency}
            disabled={!canEditLines}
            onChange={(e) => updateCustom(c.id, { frequency: e.target.value as LineFrequency })}
            className={`bg-white ${inputBase}`}
          >
            <option value="mensuel">Mensuel</option>
            <option value="trimestriel">Trimestriel</option>
            <option value="one_shot">One shot</option>
          </select>
        </td>
        <td className="px-3 py-2 text-right">
          <input type="text" disabled readOnly value={c.prevQ4} className={`w-24 text-right ${inputBase}`} />
        </td>
        {[0, 1, 2, 3].map((i) => (
          <td key={i} className="px-3 py-2 text-right">
            <input
              type="text"
              inputMode="decimal"
              value={c.q[i]}
              disabled={!canEditLines}
              onChange={(e) => updateCustomQ(c.id, i, e.target.value)}
              className={`w-24 text-right ${inputBase}`}
            />
          </td>
        ))}
        {canEditLines && (
          <td className="px-3 py-2 text-right">
            <button
              onClick={() => removeCustom(c.id)}
              disabled={busy}
              className="rounded-full border border-lav bg-white px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-card-soft"
            >
              Supprimer
            </button>
          </td>
        )}
      </tr>
    );
  }

  /** Decision du CFO ou du CEO sur la derniere version soumise. */
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
          : `Navette v${latest.version} renvoyée au métier : elle sort de la consolidation, une nouvelle version est attendue.`,
      );
      setNote('');
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

  // Timeline : une entrée par événement, dans l'ordre chronologique des versions.
  const versionsAsc = [...submissions].sort((a, b) => a.version - b.version);
  const events: { key: string; badge: React.ReactNode; text: string; note?: string }[] = [];
  for (const s of versionsAsc) {
    if (s.status === 'draft') {
      events.push({ key: `${s.id}-d`, badge: <Badge tone="peach">Brouillon</Badge>, text: `v${s.version} en brouillon` });
      continue;
    }
    events.push({
      key: `${s.id}-s`,
      badge: <Badge tone="accent" dot="mint">Soumise</Badge>,
      text: s.submitted_at ? `v${s.version} soumise le ${fmtDate(s.submitted_at)}` : `v${s.version} soumise`,
    });
    if (s.status === 'approved') {
      events.push({
        key: `${s.id}-a`,
        badge: <Badge tone="accent">Validée</Badge>,
        text: s.decided_at ? `v${s.version} validée le ${fmtDate(s.decided_at)}` : `v${s.version} validée`,
        note: s.decision_note ?? undefined,
      });
    }
    if (s.status === 'rejected') {
      events.push({
        key: `${s.id}-r`,
        badge: <Badge tone="danger">Renvoyée</Badge>,
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
            Saisie trimestrielle. Une fois soumise, la version est figée : toute modification passe par une nouvelle version.
          </p>
        </div>
        {(data.profile.role === 'cfo' || data.profile.role === 'ceo') && (
          <select
            value={effectiveDeptId ?? ''}
            onChange={(e) => setDeptId(e.target.value)}
            className={`bg-white ${inputBase}`}
          >
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
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
                  ? 'Estimation locale, aucune enveloppe définie.'
                  : overEnvelope
                    ? 'Estimation locale, au-dessus de l’enveloppe globale.'
                    : 'Estimation locale, dans l’enveloppe globale.'
              }
            />
          </div>

          {/* Suivi de la navette : timeline des versions et des décisions */}
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
                    <button onClick={saveDraft} disabled={busy} className={btnSecondary}>
                      Enregistrer le brouillon
                    </button>
                    <button onClick={submitVersion} disabled={busy} className={btnPrimary}>
                      Soumettre la navette
                    </button>
                  </>
                ) : (
                  <button onClick={createVersion} disabled={busy || defs.length === 0} className={btnPrimary}>
                    {latest ? `Nouvelle version (v${latest.version + 1})` : 'Créer la navette v1'}
                  </button>
                )}
              </div>
            )}

            {canDecide && (
              <div className="mt-5 border-t border-lav/60 pt-4">
                <p className="text-sm font-semibold text-ink">Décision sur la v{latest!.version} soumise</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Motif (facultatif)"
                    className={`w-72 bg-white ${inputBase}`}
                  />
                  <button onClick={() => decideSubmission('approved')} disabled={busy} className={btnPrimary}>
                    Valider
                  </button>
                  <button onClick={() => decideSubmission('rejected')} disabled={busy} className={btnSecondary}>
                    Renvoyer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Encart d'erreurs de soumission */}
          {problems.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Soumission refusée : corrigez d’abord ces points.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-600">
                {problems.map((p, i) => (<li key={i}>{p}</li>))}
              </ul>
            </div>
          )}

          {/* Tableau de saisie */}
          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
            {defs.length === 0 ? (
              <p className="p-5 text-sm text-ink/50">Aucun driver défini pour ce département (voir Réglages).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-5 py-3 font-semibold">Postes</th>
                      <th className="px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 text-right font-semibold">{prevQuarterLabel}</th>
                      <th className="px-3 py-3 text-right font-semibold">T1</th>
                      <th className="px-3 py-3 text-right font-semibold">T2</th>
                      <th className="px-3 py-3 text-right font-semibold">T3</th>
                      <th className="px-3 py-3 text-right font-semibold">T4</th>
                      {hasHeadcount && <th className="px-5 py-3 text-right font-semibold">Coût mensuel par ETP</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {defs.map((def: DriverDefRow) => {
                      const line = edit[def.id];
                      return (
                        <tr key={def.id} className="border-b border-lav/60 last:border-0">
                          <td className="px-5 py-2.5">
                            <p className="font-semibold text-ink">{def.label}</p>
                            <p className="text-xs text-ink/50">{KIND_LABEL[def.kind]}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone="muted">{KIND_TYPE[def.kind] ?? '-'}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="text"
                              disabled
                              readOnly
                              value={def.prev_q4 != null ? String(def.prev_q4) : ''}
                              className={`w-24 text-right ${inputBase}`}
                            />
                          </td>
                          {[0, 1, 2, 3].map((i) => (
                            <td key={i} className="px-3 py-2.5 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={!isDraft || !canManage}
                                value={line?.q[i] ?? '0'}
                                onChange={(e) =>
                                  setEdit((prev) => {
                                    const next = { ...prev };
                                    const l = { ...next[def.id] };
                                    const q = [...l.q] as EditLine['q'];
                                    q[i] = e.target.value;
                                    l.q = q;
                                    next[def.id] = l;
                                    return next;
                                  })
                                }
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
                                  disabled={!isDraft || !canManage}
                                  value={line?.unitCost ?? ''}
                                  placeholder="ex. 7500"
                                  onChange={(e) =>
                                    setEdit((prev) => ({ ...prev, [def.id]: { ...prev[def.id], unitCost: e.target.value } }))
                                  }
                                  className={`w-28 text-right ${inputBase}`}
                                />
                              ) : (
                                <span className="text-ink/30">-</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Suggestions de fournisseurs, partagées par les champs "Fournisseur" */}
          <datalist id="vendor-suggestions">
            {VENDOR_SUGGESTIONS.map((v) => (<option key={v} value={v} />))}
          </datalist>

          {/* Lignes libres : masse salariale (une ligne par ETP) */}
          <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
              <h2 className="font-semibold text-ink">Masse salariale</h2>
              <span className="text-xs text-ink/50">Une ligne par ETP, libellé = fonction.</span>
              {canEditLines && (
                <button onClick={() => addCustom('payroll')} disabled={busy} className={`${btnSecondary} ml-auto`}>
                  Ajouter un poste
                </button>
              )}
            </div>
            {payrollCustoms.length === 0 ? (
              <p className="p-5 text-sm text-ink/50">Aucun poste saisi.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-5 py-3 font-semibold">Poste</th>
                      <th className="px-3 py-3 font-semibold">Statut</th>
                      <th className="px-3 py-3 font-semibold">Fréquence</th>
                      <th className="px-3 py-3 text-right font-semibold">{prevQuarterLabel}</th>
                      <th className="px-3 py-3 text-right font-semibold">T1</th>
                      <th className="px-3 py-3 text-right font-semibold">T2</th>
                      <th className="px-3 py-3 text-right font-semibold">T3</th>
                      <th className="px-3 py-3 text-right font-semibold">T4</th>
                      {canEditLines && <th className="px-3 py-3" />}
                    </tr>
                  </thead>
                  <tbody>{payrollCustoms.map((c) => customRow(c, false))}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lignes libres : outils et dépenses (opex ou capex, avec fournisseur) */}
          <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
              <h2 className="font-semibold text-ink">Outils et dépenses</h2>
              <span className="text-xs text-ink/50">Opex ou capex, un fournisseur par ligne.</span>
              {canEditLines && (
                <button onClick={() => addCustom('opex')} disabled={busy} className={`${btnSecondary} ml-auto`}>
                  Ajouter une dépense
                </button>
              )}
            </div>
            {toolCustoms.length === 0 ? (
              <p className="p-5 text-sm text-ink/50">Aucune dépense saisie.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-5 py-3 font-semibold">Outil</th>
                      <th className="px-3 py-3 font-semibold">Fournisseur</th>
                      <th className="px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 font-semibold">Statut</th>
                      <th className="px-3 py-3 font-semibold">Fréquence</th>
                      <th className="px-3 py-3 text-right font-semibold">{prevQuarterLabel}</th>
                      <th className="px-3 py-3 text-right font-semibold">T1</th>
                      <th className="px-3 py-3 text-right font-semibold">T2</th>
                      <th className="px-3 py-3 text-right font-semibold">T3</th>
                      <th className="px-3 py-3 text-right font-semibold">T4</th>
                      {canEditLines && <th className="px-3 py-3" />}
                    </tr>
                  </thead>
                  <tbody>{toolCustoms.map((c) => customRow(c, true))}</tbody>
                </table>
              </div>
            )}
          </div>

          {deptBusinessCases.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-ink">Business cases proposés ({deptBusinessCases.length})</h2>
              <p className="mt-1 text-sm text-ink/60">
                Chaque proposition est ventilée en lignes distinctes. Un business case accepté s&apos;ajoute à la masse salariale et aux opex du département, et à la consolidation.
              </p>
              <div className="mt-3 space-y-3">
                {deptBusinessCases.map((bc) => {
                  const y1 = computeBusinessCase(bc.params).years[0];
                  const salQ = (y1?.salaries ?? 0) / 4;
                  const opxQ = (y1?.otherOpex ?? 0) / 4;
                  const impact = (y1?.salaries ?? 0) + (y1?.otherOpex ?? 0);
                  const suffix = bc.status === 'accepted' ? ' (compté)' : bc.status === 'rejected' ? ' (écarté)' : ' (si accepté)';
                  return (
                    <div key={bc.id} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-ink">{bc.label}</span>
                        {statusBadge(bc.status)}
                        <span className="text-xs text-ink/50">Impact année 1 : {fmtKEur(impact)}{suffix}</span>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                              <th className="px-3 py-2 font-semibold">Ligne du business case</th>
                              <th className="px-3 py-2 text-right font-semibold">T1</th>
                              <th className="px-3 py-2 text-right font-semibold">T2</th>
                              <th className="px-3 py-2 text-right font-semibold">T3</th>
                              <th className="px-3 py-2 text-right font-semibold">T4</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-lav/60">
                              <td className="px-3 py-1.5 text-ink/70">{bc.label} : salaires</td>
                              {[0, 1, 2, 3].map((i) => (<td key={i} className="px-3 py-1.5 text-right tabular-nums">{Math.round(salQ).toLocaleString('fr-FR')}</td>))}
                            </tr>
                            <tr>
                              <td className="px-3 py-1.5 text-ink/70">{bc.label} : opex</td>
                              {[0, 1, 2, 3].map((i) => (<td key={i} className="px-3 py-1.5 text-right tabular-nums">{Math.round(opxQ).toLocaleString('fr-FR')}</td>))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
              {acceptedBcAnnual > 0 && (
                <p className="mt-3 text-sm text-ink/70">
                  Business cases acceptés : +{fmtKEur(acceptedBcAnnual)} sur le coût annuel du département, intégrés à la consolidation.
                </p>
              )}
            </div>
          )}

          {message && <p className="mt-4 text-sm text-ink/70">{message}</p>}
        </>
      )}
    </Page>
  );
}
