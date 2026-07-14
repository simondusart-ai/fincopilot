'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, ErrorBox, Loading, Page, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { fmtKEur } from '@/lib/format';
import type { DriverDefRow, SubmissionLineRow, SubmissionRow } from '@/lib/data';

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

  return (
    <Page data={data}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Navette budgétaire {data.company.budget_year}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Saisie trimestrielle. Une fois soumise, la version est figée : toute modification passe par une nouvelle version.
          </p>
        </div>
        {data.profile.role === 'cfo' && (
          <select
            value={effectiveDeptId ?? ''}
            onChange={(e) => setDeptId(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
            <Card title="Département" value={dept.name} />
            <Card
              title="Enveloppe de cadrage"
              value={dept.envelope != null ? fmtKEur(Number(dept.envelope)) : 'Aucune'}
              hint="Décidée au codir ; un dépassement est signalé, jamais bloqué."
            />
            <Card
              title="Coût annuel saisi (estimation)"
              value={fmtKEur(annualCostEstimate)}
              tone={dept.envelope != null && annualCostEstimate > Number(dept.envelope) ? 'bad' : 'default'}
            />
          </div>

          <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
              <span className="font-medium">
                {latest ? `Version v${latest.version}` : 'Aucune version'}
              </span>
              {latest && (
                <span className={`text-xs rounded-full px-2 py-0.5 ${isDraft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isDraft ? 'Brouillon' : 'Soumise (figée)'}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {isDraft && (
                  <>
                    <button onClick={saveDraft} disabled={busy} className="text-sm border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
                      Enregistrer le brouillon
                    </button>
                    <button onClick={submitVersion} disabled={busy} className="text-sm bg-indigo-700 text-white rounded px-3 py-1.5 hover:bg-indigo-800 disabled:opacity-50">
                      Soumettre la navette
                    </button>
                  </>
                )}
                {!isDraft && (
                  <button onClick={createVersion} disabled={busy || defs.length === 0} className="text-sm bg-indigo-700 text-white rounded px-3 py-1.5 hover:bg-indigo-800 disabled:opacity-50">
                    {latest ? `Nouvelle version (v${latest.version + 1})` : 'Créer la navette v1'}
                  </button>
                )}
              </div>
            </div>

            {defs.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Aucun driver défini pour ce département (voir Réglages).</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-2 font-medium">Driver</th>
                    <th className="px-2 py-2 font-medium text-right">T1</th>
                    <th className="px-2 py-2 font-medium text-right">T2</th>
                    <th className="px-2 py-2 font-medium text-right">T3</th>
                    <th className="px-2 py-2 font-medium text-right">T4</th>
                    <th className="px-4 py-2 font-medium text-right">Coût mensuel / ETP</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map((def: DriverDefRow) => {
                    const line = edit[def.id];
                    return (
                      <tr key={def.id} className="border-b border-slate-100">
                        <td className="px-4 py-2">
                          <p className="font-medium">{def.label}</p>
                          <p className="text-xs text-slate-400">{KIND_LABEL[def.kind]}</p>
                        </td>
                        {[0, 1, 2, 3].map((i) => (
                          <td key={i} className="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={!isDraft}
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
                              className="w-24 border border-slate-300 rounded px-2 py-1 text-right disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right">
                          {def.kind === 'headcount' ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={!isDraft}
                              value={line?.unitCost ?? ''}
                              placeholder="ex. 7500"
                              onChange={(e) =>
                                setEdit((prev) => ({ ...prev, [def.id]: { ...prev[def.id], unitCost: e.target.value } }))
                              }
                              className="w-28 border border-slate-300 rounded px-2 py-1 text-right disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {problems.length > 0 && (
            <div className="mt-4 border border-red-300 bg-red-50 rounded p-4">
              <p className="text-sm font-medium text-red-800">Soumission refusée : corrigez d’abord ces points.</p>
              <ul className="mt-2 space-y-1 text-sm text-red-700 list-disc pl-5">
                {problems.map((p, i) => (<li key={i}>{p}</li>))}
              </ul>
            </div>
          )}
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

          {submissions.length > 1 && (
            <p className="mt-6 text-xs text-slate-400">
              Historique : {submissions.map((s) => `v${s.version} (${s.status === 'draft' ? 'brouillon' : 'soumise'})`).join(', ')}.
            </p>
          )}
        </>
      )}
    </Page>
  );
}
