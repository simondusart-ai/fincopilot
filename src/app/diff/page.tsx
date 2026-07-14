'use client';

import { useMemo, useState } from 'react';
import { Card, ErrorBox, Loading, Page, usePortalData } from '@/components/shell';
import { buildConsolidationInputs, toCompanyConfig, toSubmission } from '@/lib/data';
import { diffSubmissions } from '@/lib/engine';
import { fmtKEur, fmtMonths } from '@/lib/format';

export default function DiffPage() {
  const { data, error, loading } = usePortalData();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [vBefore, setVBefore] = useState<number | null>(null);
  const [vAfter, setVAfter] = useState<number | null>(null);

  const effectiveDeptId = deptId ?? data?.departments[0]?.id ?? null;
  const versions = useMemo(
    () =>
      (data?.submissions ?? [])
        .filter((s) => s.department_id === effectiveDeptId)
        .sort((a, b) => a.version - b.version),
    [data, effectiveDeptId],
  );

  const diff = useMemo(() => {
    if (!data || !effectiveDeptId || versions.length < 2) return null;
    const before = versions.find((s) => s.version === (vBefore ?? versions[versions.length - 2].version));
    const after = versions.find((s) => s.version === (vAfter ?? versions[versions.length - 1].version));
    if (!before || !after || before.id === after.id) return null;
    const inputs = buildConsolidationInputs(data);
    // Pour mesurer l'impact consolidé, la version "before" remplace la navette du département.
    const inputsWithBefore = {
      ...inputs,
      submissions: [
        ...inputs.submissions.filter((s) => s.departmentId !== effectiveDeptId),
        { ...toSubmission(before, data.lines), status: 'submitted' as const },
      ],
    };
    return diffSubmissions(
      inputs.driverDefs,
      toCompanyConfig(data.company),
      { ...toSubmission(before, data.lines), status: 'submitted' },
      { ...toSubmission(after, data.lines), status: 'submitted' },
      inputsWithBefore,
    );
  }, [data, effectiveDeptId, versions, vBefore, vAfter]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  const dept = data.departments.find((d) => d.id === effectiveDeptId);

  return (
    <Page data={data}>
      <h1 className="text-xl font-semibold">Comparer deux versions de navette</h1>
      <p className="text-sm text-slate-500 mt-1">
        La réalité d’une campagne budgétaire, ce sont les allers-retours : cette page chiffre ce qui a changé entre deux versions et l’impact sur le consolidé.
      </p>

      <div className="mt-4 flex gap-3 flex-wrap items-center">
        <select
          value={effectiveDeptId ?? ''}
          onChange={(e) => { setDeptId(e.target.value); setVBefore(null); setVAfter(null); }}
          className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
        >
          {data.departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        {versions.length >= 2 && (
          <>
            <select
              value={vBefore ?? versions[versions.length - 2].version}
              onChange={(e) => setVBefore(Number(e.target.value))}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              {versions.map((v) => (<option key={v.id} value={v.version}>v{v.version} ({v.status === 'draft' ? 'brouillon' : 'soumise'})</option>))}
            </select>
            <span className="text-slate-400 text-sm">vers</span>
            <select
              value={vAfter ?? versions[versions.length - 1].version}
              onChange={(e) => setVAfter(Number(e.target.value))}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              {versions.map((v) => (<option key={v.id} value={v.version}>v{v.version} ({v.status === 'draft' ? 'brouillon' : 'soumise'})</option>))}
            </select>
          </>
        )}
      </div>

      {versions.length < 2 ? (
        <p className="mt-6 text-sm text-slate-500">
          {dept?.name} : moins de deux versions disponibles, rien à comparer pour l’instant.
        </p>
      ) : !diff ? (
        <p className="mt-6 text-sm text-slate-500">Sélectionnez deux versions différentes.</p>
      ) : (
        <>
          {diff.impact && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <Card
                title="Impact EBITDA annuel"
                value={`${diff.impact.deltaEbitda >= 0 ? '+' : ''}${fmtKEur(diff.impact.deltaEbitda)}`}
                tone={diff.impact.deltaEbitda >= 0 ? 'good' : 'bad'}
              />
              <Card
                title="Impact trésorerie fin d'année"
                value={`${diff.impact.deltaEndCash >= 0 ? '+' : ''}${fmtKEur(diff.impact.deltaEndCash)}`}
                tone={diff.impact.deltaEndCash >= 0 ? 'good' : 'bad'}
              />
              <Card title="Runway min avant" value={fmtMonths(diff.impact.minRunwayBefore)} />
              <Card title="Runway min après" value={fmtMonths(diff.impact.minRunwayAfter)} />
            </div>
          )}

          <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <h2 className="font-medium px-4 pt-4">
              {dept?.name} : v{diff.versionBefore} vers v{diff.versionAfter}, {diff.lines.length} ligne(s) modifiée(s)
            </h2>
            {diff.lines.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Aucune différence entre ces deux versions.</p>
            ) : (
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-2 font-medium">Ligne</th>
                    <th className="px-4 py-2 font-medium">v{diff.versionBefore} (T1 à T4)</th>
                    <th className="px-4 py-2 font-medium">v{diff.versionAfter} (T1 à T4)</th>
                    <th className="px-4 py-2 font-medium text-right">Impact annuel</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.lines.map((l) => (
                    <tr key={l.driverDefId} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium">{l.label}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {l.before ? l.before.map((v) => v.toLocaleString('fr-FR')).join(' / ') : 'ligne absente'}
                        {l.unitCostBefore !== undefined && ` (coût ETP ${l.unitCostBefore.toLocaleString('fr-FR')} €)`}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {l.after ? l.after.map((v) => v.toLocaleString('fr-FR')).join(' / ') : 'ligne supprimée'}
                        {l.unitCostAfter !== undefined && ` (coût ETP ${l.unitCostAfter.toLocaleString('fr-FR')} €)`}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${l.deltaAnnual < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {l.deltaAnnual >= 0 ? '+' : ''}{fmtKEur(l.deltaAnnual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
