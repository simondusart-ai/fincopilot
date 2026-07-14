'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, usePortalData } from '@/components/shell';
import { MonthlyChart } from '@/components/monthly-chart';
import { buildConsolidationInputs, latestSubmittedByDept } from '@/lib/data';
import { consolidate } from '@/lib/engine';
import { MONTH_LABELS, fmtEur, fmtKEur, fmtMonths, fmtPct } from '@/lib/format';
import { exportConsolidation } from '@/lib/xlsx';

// Ligne de tableau mensuel : 'line' = détail, 'solde' = ligne surlignée (fond lavande),
// 'pct' = sous-ligne grise en pourcentage. Les % sont dérivés des sorties du moteur.
type RowKind = 'line' | 'solde' | 'pct';
interface PnlRow {
  label: string;
  kind: RowKind;
  fn: (m: number) => number;
}

export default function DashboardPage() {
  const { data, error, loading } = usePortalData();
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const result = useMemo(() => (data ? consolidate(buildConsolidationInputs(data)) : null), [data]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data || !result) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  const latest = latestSubmittedByDept(data.submissions);
  const M = result.months;

  // Tableau P&L : détails, lignes de solde surlignées et sous-lignes de marge en %.
  const pnlRows: PnlRow[] = [
    { label: 'MRR fin de mois', kind: 'line', fn: (m) => M[m].mrrEnd },
    { label: 'Revenus non récurrents', kind: 'line', fn: (m) => M[m].otherRevenue },
    { label: 'Revenu', kind: 'line', fn: (m) => M[m].revenue },
    { label: 'COGS', kind: 'line', fn: (m) => -M[m].cogsTotal },
    { label: 'Marge brute', kind: 'solde', fn: (m) => M[m].grossMargin },
    { label: 'Marge brute (%)', kind: 'pct', fn: (m) => (M[m].revenue ? (M[m].revenue - M[m].cogsTotal) / M[m].revenue : NaN) },
    { label: 'Coûts S&M', kind: 'line', fn: (m) => -M[m].smSpend },
    { label: 'Marge de contribution', kind: 'solde', fn: (m) => M[m].contributionMargin },
    { label: 'Marge de contribution (%)', kind: 'pct', fn: (m) => (M[m].contributionMarginPct ?? NaN) },
    { label: 'Salaires', kind: 'line', fn: (m) => -M[m].payrollTotal },
    { label: 'Autres opex', kind: 'line', fn: (m) => -M[m].opexTotal },
    { label: 'EBITDA', kind: 'solde', fn: (m) => M[m].ebitda },
    { label: 'Marge sur EBITDA (%)', kind: 'pct', fn: (m) => (M[m].revenue ? M[m].ebitda / M[m].revenue : NaN) },
    { label: 'Capex', kind: 'line', fn: (m) => -M[m].capexTotal },
  ];

  // Pivot des CAC par canal : canaux en lignes, trimestres en colonnes.
  const channelOrder: { id: string; name: string; cap: number | null }[] = [];
  const seenChannel = new Set<string>();
  for (const cq of result.channelQuarters) {
    if (!seenChannel.has(cq.channelId)) {
      seenChannel.add(cq.channelId);
      channelOrder.push({ id: cq.channelId, name: cq.name, cap: cq.cacCap });
    }
  }
  const cacCell = (id: string, q: number) => result.channelQuarters.find((c) => c.channelId === id && c.quarter === q) ?? null;

  const pctCell = (v: number) => (Number.isFinite(v) ? fmtPct(v) : 'n.a.');

  return (
    <Page data={data}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Consolidation budget {data.company.budget_year}</h1>
          <p className="mt-1 text-sm text-ink/60">
            Recalculée en direct à partir des dernières navettes soumises.
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
            className={btnPrimary}
          >
            Exporter le classeur codir (.xlsx)
          </button>
        )}
      </div>
      {exportMsg && <p className="mt-2 text-sm text-red-600">{exportMsg}</p>}

      {/* Statut des navettes */}
      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Navettes reçues</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.departments.map((d) => {
            const sub = latest.get(d.id);
            return sub ? (
              <Badge key={d.id} tone="accent" dot="mint">{d.name} v{sub.version} soumise</Badge>
            ) : (
              <Badge key={d.id} tone="danger" dot="red">{d.name} manquante</Badge>
            );
          })}
        </div>
      </div>

      {/* Contrôles bloquants : le moteur refuse de consolider */}
      {!result.ok ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-700">
            Consolidation refusée : {result.blocking.length} contrôle(s) bloquant(s)
          </h2>
          <p className="mt-1 text-sm italic text-red-600">
            Principe : on ne produit pas un P&L faux. Corrigez les points ci-dessous puis rechargez.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-red-700">
            {result.blocking.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
                  {a.code}
                </span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Card title="MRR fin d'année" value={fmtKEur(result.totals!.mrrEnd)} />
            <Card
              title="EBITDA annuel"
              value={`${result.totals!.ebitda >= 0 ? '+' : ''}${fmtKEur(result.totals!.ebitda)}`}
              tone={result.totals!.ebitda < 0 ? 'bad' : 'default'}
              dot={result.totals!.ebitda >= 0}
            />
            <Card
              title="Trésorerie fin d'année"
              value={fmtKEur(result.totals!.endCash)}
              tone={result.totals!.endCash < 0 ? 'bad' : 'default'}
            />
            <Card
              title="Runway"
              value={fmtMonths(result.totals!.minRunway)}
              hint={`Seuils : vigilance ${data.company.runway_vigilance_months} mois, gel ${data.company.runway_freeze_months} mois`}
              tone={
                result.totals!.minRunway !== null && result.totals!.minRunway < Number(data.company.runway_freeze_months)
                  ? 'bad'
                  : 'default'
              }
            />
            <Card
              title="CAC moyen"
              value={result.totals!.blendedCac !== null ? fmtEur(result.totals!.blendedCac) : 'n.a.'}
              hint={result.totals!.grossPaybackMonths !== null ? `Payback brut ${result.totals!.grossPaybackMonths.toFixed(1)} mois` : undefined}
            />
          </div>

          {/* Alertes de gestion */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-ink">
              Alertes de gestion ({result.warnings.length}) : à arbitrer, jamais bloquantes
            </h2>
            {result.warnings.length === 0 ? (
              <p className="mt-2 text-sm text-ink/60">Aucune alerte : le budget respecte le cadrage codir.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-peach px-4 py-3 text-sm text-ink">
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">
                      {w.code}
                    </span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Graphique EBITDA mensuel et solde de trésorerie (présentationnel) */}
          <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-ink">EBITDA mensuel et solde de trésorerie {data.company.budget_year}</h2>
            <MonthlyChart months={result.months} />
          </div>

          {/* Contributions par département */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="px-5 pt-5 font-semibold text-ink">Contribution par département</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-5 py-3 font-semibold">Département</th>
                    <th className="px-5 py-3 text-right font-semibold">Coût annuel</th>
                    <th className="px-5 py-3 text-right font-semibold">Enveloppe</th>
                    <th className="px-5 py-3 text-right font-semibold">Écart</th>
                    <th className="px-5 py-3 text-right font-semibold">MRR annuel ajouté</th>
                  </tr>
                </thead>
                <tbody>
                  {result.departments.map((d) => (
                    <tr key={d.departmentId} className="border-b border-lav/60 last:border-0">
                      <td className="px-5 py-2.5 font-semibold text-ink">{d.name}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{fmtKEur(d.annualCost)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{d.envelope !== null ? fmtKEur(d.envelope) : '-'}</td>
                      <td className="px-5 py-2.5 text-right">
                        {d.envelope === null ? (
                          <span className="text-ink/40">-</span>
                        ) : d.envelopeOverrun ? (
                          <span className="font-semibold tabular-nums text-red-600">+{fmtKEur(d.envelopeOverrun)}</span>
                        ) : (
                          <Badge tone="accent">Dans le cadrage</Badge>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{d.annualMrrAdded > 0 ? fmtKEur(d.annualMrrAdded) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* P&L mensuel */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="px-5 pt-5 font-semibold text-ink">P&amp;L mensuel consolidé (k€)</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">Ligne</th>
                    {MONTH_LABELS.map((m) => (<th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {pnlRows.map(({ label, kind, fn }) => {
                    if (kind === 'pct') {
                      return (
                        <tr key={label} className="border-b border-lav/60">
                          <td className="sticky left-0 z-10 bg-white px-5 py-1 italic text-ink/50">{label}</td>
                          {MONTH_LABELS.map((_, m) => (
                            <td key={m} className="px-3 py-1 text-right italic tabular-nums text-ink/50">{pctCell(fn(m))}</td>
                          ))}
                        </tr>
                      );
                    }
                    const strong = kind === 'solde';
                    return (
                      <tr key={label} className={strong ? 'bg-lav' : 'border-b border-lav/60'}>
                        <td className={`sticky left-0 z-10 px-5 py-1.5 ${strong ? 'bg-lav font-semibold' : 'bg-white'}`}>{label}</td>
                        {MONTH_LABELS.map((_, m) => {
                          const v = fn(m);
                          return (
                            <td key={m} className={`px-3 py-1.5 text-right tabular-nums ${v < 0 ? 'text-red-600' : ''} ${strong ? 'font-semibold' : ''}`}>
                              {Math.round(v / 1000).toLocaleString('fr-FR')}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trésorerie et runway */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="px-5 pt-5 font-semibold text-ink">Trésorerie et runway</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">Ligne</th>
                    {MONTH_LABELS.map((m) => (<th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-lav">
                    <td className="sticky left-0 z-10 bg-lav px-5 py-1.5 font-semibold">Solde de trésorerie fin de période (k€)</td>
                    {M.map((r) => (
                      <td key={r.month} className={`px-3 py-1.5 text-right font-semibold tabular-nums ${r.cash < 0 ? 'text-red-600' : ''}`}>
                        {Math.round(r.cash / 1000).toLocaleString('fr-FR')}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-lav/60">
                    <td className="sticky left-0 z-10 bg-white px-5 py-1 italic text-ink/50">Runway (mois)</td>
                    {M.map((r) => (
                      <td key={r.month} className="px-3 py-1 text-right italic tabular-nums text-ink/50">
                        {r.runwayMonths === null ? 'n.a.' : r.runwayMonths.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* CAC par canal : trimestres en colonnes */}
          {channelOrder.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
              <h2 className="px-5 pt-5 font-semibold text-ink">CAC par canal et par trimestre</h2>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-5 py-3 font-semibold">Canal</th>
                      <th className="px-5 py-3 text-right font-semibold">Plafond</th>
                      {[1, 2, 3, 4].map((q) => (<th key={q} className="px-5 py-3 text-right font-semibold">T{q}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {channelOrder.map((ch) => (
                      <tr key={ch.id} className="border-b border-lav/60 last:border-0">
                        <td className="px-5 py-2 font-semibold text-ink">{ch.name}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-ink/60">{ch.cap === null ? '-' : fmtEur(ch.cap)}</td>
                        {[1, 2, 3, 4].map((q) => {
                          const cell = cacCell(ch.id, q);
                          const above = cell?.cac != null && ch.cap != null && cell.cac > ch.cap;
                          return (
                            <td key={q} className={`px-5 py-2 text-right tabular-nums ${above ? 'font-semibold text-red-600' : ''}`}>
                              {cell == null || cell.cac === null ? 'n.a.' : fmtEur(cell.cac)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
