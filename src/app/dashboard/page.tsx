'use client';

import { useMemo, useState } from 'react';
import { Card, ErrorBox, Loading, Page, usePortalData } from '@/components/shell';
import { buildConsolidationInputs, latestSubmittedByDept } from '@/lib/data';
import { consolidate } from '@/lib/engine';
import { MONTH_LABELS, fmtEur, fmtKEur, fmtMonths, fmtPct } from '@/lib/format';
import { exportConsolidation } from '@/lib/xlsx';

export default function DashboardPage() {
  const { data, error, loading } = usePortalData();
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const result = useMemo(() => (data ? consolidate(buildConsolidationInputs(data)) : null), [data]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data || !result) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  const latest = latestSubmittedByDept(data.submissions);

  return (
    <Page data={data}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Consolidation budget {data.company.budget_year}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Recalculée en direct à partir des dernières navettes soumises. Moteur déterministe et testé.
          </p>
        </div>
        {result.ok && (
          <button
            onClick={async () => {
              try {
                await exportConsolidation(result, data.company.name, data.company.budget_year);
              } catch (e) {
                setExportMsg(e instanceof Error ? e.message : String(e));
              }
            }}
            className="text-sm bg-indigo-700 text-white rounded px-3 py-2 hover:bg-indigo-800"
          >
            Exporter le classeur codir (.xlsx)
          </button>
        )}
      </div>
      {exportMsg && <p className="text-sm text-red-700 mt-2">{exportMsg}</p>}

      {/* Statut des navettes */}
      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium">Navettes reçues</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.departments.map((d) => {
            const sub = latest.get(d.id);
            return (
              <span
                key={d.id}
                className={`text-xs rounded-full px-3 py-1 ${sub ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
              >
                {d.name} : {sub ? `v${sub.version} soumise` : 'manquante'}
              </span>
            );
          })}
        </div>
      </div>

      {/* Contrôles bloquants : le moteur refuse de consolider */}
      {!result.ok ? (
        <div className="mt-6 border border-red-300 bg-red-50 rounded-lg p-5">
          <h2 className="font-semibold text-red-800">Consolidation refusée : {result.blocking.length} contrôle(s) bloquant(s)</h2>
          <p className="text-sm text-red-700 mt-1">
            Principe : on ne produit pas un P&L faux. Corrigez les points ci-dessous puis rechargez.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-red-800 list-disc pl-5">
            {result.blocking.map((a, i) => (<li key={i}><span className="font-mono text-xs mr-2">{a.code}</span>{a.message}</li>))}
          </ul>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
            <Card title="MRR fin d'année" value={fmtKEur(result.totals!.mrrEnd)} />
            <Card
              title="EBITDA annuel"
              value={fmtKEur(result.totals!.ebitda)}
              tone={result.totals!.ebitda < 0 ? 'bad' : 'good'}
            />
            <Card
              title="Trésorerie fin d'année"
              value={fmtKEur(result.totals!.endCash)}
              tone={result.totals!.endCash < 0 ? 'bad' : 'default'}
            />
            <Card
              title="Runway minimum"
              value={fmtMonths(result.totals!.minRunway)}
              hint={`Seuils : vigilance ${data.company.runway_vigilance_months} mois, gel ${data.company.runway_freeze_months} mois`}
              tone={
                result.totals!.minRunway !== null && result.totals!.minRunway < Number(data.company.runway_freeze_months)
                  ? 'bad'
                  : 'default'
              }
            />
            <Card
              title="CAC moyen / payback brut"
              value={result.totals!.blendedCac !== null ? fmtEur(result.totals!.blendedCac) : 'n.a.'}
              hint={result.totals!.grossPaybackMonths !== null ? `Payback brut ${result.totals!.grossPaybackMonths.toFixed(1)} mois` : undefined}
            />
          </div>

          {/* Alertes de gestion */}
          <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-medium">
              Alertes de gestion ({result.warnings.length}) : à arbitrer, jamais bloquantes
            </h2>
            {result.warnings.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">Aucune alerte : le budget respecte le cadrage codir.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-900">
                    <span className="font-mono text-xs mr-2">{w.code}</span>
                    {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Contributions par département */}
          <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <h2 className="font-medium px-4 pt-4">Contribution par département</h2>
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium">Département</th>
                  <th className="px-4 py-2 font-medium text-right">Coût annuel</th>
                  <th className="px-4 py-2 font-medium text-right">Enveloppe</th>
                  <th className="px-4 py-2 font-medium text-right">Écart</th>
                  <th className="px-4 py-2 font-medium text-right">MRR annuel ajouté</th>
                </tr>
              </thead>
              <tbody>
                {result.departments.map((d) => (
                  <tr key={d.departmentId} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-medium">{d.name}</td>
                    <td className="px-4 py-2 text-right">{fmtKEur(d.annualCost)}</td>
                    <td className="px-4 py-2 text-right">{d.envelope !== null ? fmtKEur(d.envelope) : '-'}</td>
                    <td className={`px-4 py-2 text-right ${d.envelopeOverrun ? 'text-red-700 font-medium' : 'text-emerald-700'}`}>
                      {d.envelope === null ? '-' : d.envelopeOverrun ? `+${fmtKEur(d.envelopeOverrun)}` : 'dans le cadrage'}
                    </td>
                    <td className="px-4 py-2 text-right">{d.annualMrrAdded > 0 ? fmtKEur(d.annualMrrAdded) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* P&L mensuel */}
          <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <h2 className="font-medium px-4 pt-4">P&L mensuel consolidé (k€)</h2>
            <table className="w-full text-sm mt-2 whitespace-nowrap">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium sticky left-0 bg-white">Ligne</th>
                  {MONTH_LABELS.map((m) => (<th key={m} className="px-2 py-2 font-medium text-right">{m}</th>))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['MRR fin de mois', (m: number) => result.months[m].mrrEnd, false],
                  ['Revenus non récurrents', (m: number) => result.months[m].otherRevenue, false],
                  ['Revenu', (m: number) => result.months[m].revenue, false],
                  ['COGS', (m: number) => -result.months[m].cogsTotal, false],
                  ['Marge brute', (m: number) => result.months[m].grossMargin, false],
                  ['Coûts S&M', (m: number) => -result.months[m].smSpend, false],
                  ['Marge de contribution', (m: number) => result.months[m].contributionMargin, true],
                  ['Salaires', (m: number) => -result.months[m].payrollTotal, false],
                  ['Autres opex', (m: number) => -result.months[m].opexTotal, false],
                  ['EBITDA', (m: number) => result.months[m].ebitda, true],
                  ['Trésorerie', (m: number) => result.months[m].cash, false],
                ] as Array<[string, (m: number) => number, boolean]>).map(([label, fn, strong]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <td className={`px-4 py-1.5 sticky left-0 bg-white ${strong ? 'font-semibold' : ''}`}>{label}</td>
                    {MONTH_LABELS.map((_, m) => {
                      const v = fn(m);
                      return (
                        <td key={m} className={`px-2 py-1.5 text-right ${v < 0 ? 'text-red-700' : ''} ${strong ? 'font-semibold' : ''}`}>
                          {Math.round(v / 1000).toLocaleString('fr-FR')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-1.5 sticky left-0 bg-white text-slate-500">Runway (mois)</td>
                  {result.months.map((r) => (
                    <td key={r.month} className="px-2 py-1.5 text-right text-slate-500">
                      {r.runwayMonths === null ? 'n.a.' : r.runwayMonths.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-1.5 sticky left-0 bg-white text-slate-500">Marge de contribution (% CA)</td>
                  {result.months.map((r) => (
                    <td key={r.month} className="px-2 py-1.5 text-right text-slate-500">
                      {r.contributionMarginPct === null ? 'n.a.' : fmtPct(r.contributionMarginPct)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* CAC par canal */}
          {result.channelQuarters.length > 0 && (
            <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <h2 className="font-medium px-4 pt-4">CAC par canal et par trimestre</h2>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-2 font-medium">Canal</th>
                    <th className="px-4 py-2 font-medium text-right">Trimestre</th>
                    <th className="px-4 py-2 font-medium text-right">Dépenses</th>
                    <th className="px-4 py-2 font-medium text-right">Nouveaux clients</th>
                    <th className="px-4 py-2 font-medium text-right">CAC</th>
                    <th className="px-4 py-2 font-medium text-right">Plafond</th>
                  </tr>
                </thead>
                <tbody>
                  {result.channelQuarters.map((c, i) => {
                    const above = c.cac !== null && c.cacCap !== null && c.cac > c.cacCap;
                    return (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-4 py-1.5">{c.name}</td>
                        <td className="px-4 py-1.5 text-right">T{c.quarter}</td>
                        <td className="px-4 py-1.5 text-right">{fmtKEur(c.spend)}</td>
                        <td className="px-4 py-1.5 text-right">{c.newCustomers.toLocaleString('fr-FR')}</td>
                        <td className={`px-4 py-1.5 text-right ${above ? 'text-red-700 font-medium' : ''}`}>
                          {c.cac === null ? 'n.a.' : fmtEur(c.cac)}
                        </td>
                        <td className="px-4 py-1.5 text-right">{c.cacCap === null ? '-' : fmtEur(c.cacCap)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
