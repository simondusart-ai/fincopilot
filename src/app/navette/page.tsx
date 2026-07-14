'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, btnSecondary, inputBase, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { computeBusinessCase } from '@/lib/engine';
import { fmtKEur } from '@/lib/format';
import type { DriverDefRow, SubmissionRow } from '@/lib/data';

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
      return;
    }
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
  const annualCostEstimate = defs.reduce((total, def) => {
    const line = edit[def.id];
    if (!line) return total;
    const qs = line.q.map((v) => Number(v) || 0);
    const s = qs.reduce((a, b) => a + b, 0);
    if (def.kind === 'headcount') return total + s * 3 * (Number(line.unitCost) || 0);
    if (def.kind === 'payroll' || def.kind === 'opex' || def.kind === 'cogs' || def.kind === 'channel_spend') return total + s;
    return total;
  }, 0);

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

  // Droits : le CFO gère toute navette, un Head of la sienne ; le CEO consulte et arbitre.
  const canManage = data.profile.role === 'cfo' || data.profile.department_id === effectiveDeptId;
  const canArbitrate = data.profile.role === 'cfo' || data.profile.role === 'ceo';
  const deptBusinessCases = (data.businessCases ?? []).filter((bc) => bc.target_department_id === effectiveDeptId);
  const acceptedBcAnnual = deptBusinessCases
    .filter((bc) => bc.status === 'accepted')
    .reduce((sum, bc) => { const y1 = computeBusinessCase(bc.params).years[0]; return sum + (y1 ? y1.salaries + y1.otherOpex : 0); }, 0);

  const submittedDate =
    latest && !isDraft && latest.submitted_at
      ? new Date(latest.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

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

          {/* Barre de version */}
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <Badge tone="muted">{latest ? `Version v${latest.version}` : 'Aucune version'}</Badge>
            {latest &&
              (isDraft ? (
                <Badge tone="peach">Brouillon</Badge>
              ) : (
                <Badge tone="accent" dot="mint">Soumise (figée)</Badge>
              ))}
            <div className="ml-auto flex gap-2">
              {canManage && (isDraft ? (
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
              ))}
            </div>
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

          {submittedDate && (
            <p className="mt-3 text-xs italic text-ink/50">
              Version v{latest!.version} soumise le {submittedDate} · lecture seule.
            </p>
          )}
          {message && <p className="mt-4 text-sm text-ink/70">{message}</p>}

          {submissions.length > 1 && (
            <p className="mt-4 text-xs text-ink/40">
              Historique : {submissions.map((s) => `v${s.version} (${s.status === 'draft' ? 'brouillon' : 'soumise'})`).join(', ')}.
            </p>
          )}
        </>
      )}
    </Page>
  );
}
