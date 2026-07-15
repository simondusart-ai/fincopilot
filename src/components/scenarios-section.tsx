'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, btnSecondary, inputBase } from '@/components/shell';
import { InfoTip } from '@/components/info-tip';
import { ScenarioChart, type ScenarioChartPoint } from '@/components/scenario-chart';
import {
  loadSimulationAssumptions,
  toScenarioAssumptions,
  type PnlYearRow,
  type SimulationAssumptionsRow,
} from '@/lib/data';
import {
  projectScenarios,
  realizedScenarioYear,
  type ScenarioAssumptions,
  type ScenarioHistoryYearN,
  type ScenarioYear,
} from '@/lib/engine';
import { fmtEur, fmtPct } from '@/lib/format';

// Montants deja en K€ pour ce module : on affiche l'entier, signe negatif compris.
const kEur = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : 'n.a.');
const signedPct = (frac: number) => (Number.isFinite(frac) ? `${frac >= 0 ? '+' : ''}${fmtPct(frac, 1)}` : 'n.a.');
const pct1 = (frac: number) => (Number.isFinite(frac) ? fmtPct(frac, 1) : 'n.a.');
const ruleFmt = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}` : 'n.a.');
const numOr = (s: string, d: number) => {
  const v = Number(s.replace(',', '.').trim());
  return Number.isFinite(v) ? v : d;
};
const pctStr = (frac: number) => String(Number((frac * 100).toFixed(4)));

// Lignes du tableau annuel. 'solde' = fond lavande ; 'sub' = sous-ligne italique grise.
type RowKind = 'line' | 'solde' | 'sub';
interface TableRow {
  label: string;
  kind: RowKind;
  info?: string;
  cell: (y: ScenarioYear) => { text: string; neg?: boolean };
}
const TABLE_ROWS: TableRow[] = [
  { label: 'Chiffre d’affaires', kind: 'line', cell: (y) => ({ text: kEur(y.ca) }) },
  { label: 'Croissance', kind: 'sub', cell: (y) => ({ text: signedPct(y.growth) }) },
  { label: 'Coûts variables', kind: 'line', info: 'Convention marge brute : les coûts variables sont le complément du CA.', cell: (y) => ({ text: kEur(-y.variableCosts), neg: y.variableCosts > 0 }) },
  { label: 'Marge brute', kind: 'solde', cell: (y) => ({ text: kEur(y.grossMargin), neg: y.grossMargin < 0 }) },
  { label: 'Marge brute (%)', kind: 'sub', cell: (y) => ({ text: pct1(y.grossMarginPct) }) },
  { label: 'Coûts S&M', kind: 'line', cell: (y) => ({ text: kEur(-y.sm), neg: y.sm > 0 }) },
  { label: 'Coûts de structure', kind: 'line', info: 'Proportionnels à la marge brute, au ratio observé sur le dernier exercice réalisé.', cell: (y) => ({ text: kEur(-y.structure), neg: y.structure > 0 }) },
  { label: 'EBITDA', kind: 'solde', cell: (y) => ({ text: kEur(y.ebitda), neg: y.ebitda < 0 }) },
  { label: 'Marge EBITDA (%)', kind: 'sub', cell: (y) => ({ text: signedPct(y.ebitdaMarginPct) }) },
  { label: 'Dotations', kind: 'line', cell: (y) => ({ text: kEur(-y.da), neg: y.da > 0 }) },
  { label: 'EBIT', kind: 'solde', cell: (y) => ({ text: kEur(y.ebit), neg: y.ebit < 0 }) },
  { label: 'Rule of 40', kind: 'line', info: 'Croissance du CA plus marge EBITDA, en points. Repère de santé (objectif : 40).', cell: (y) => ({ text: ruleFmt(y.ruleOf40), neg: Number.isFinite(y.ruleOf40) && y.ruleOf40 < 0 }) },
];

interface Form {
  g1: string;
  g2: string;
  g3: string;
  gm: string;
  smg: string;
  smf: string;
  cash: string;
}
const formFromRow = (r: SimulationAssumptionsRow): Form => ({
  g1: pctStr(Number(r.growth_n1)),
  g2: pctStr(Number(r.growth_n2)),
  g3: pctStr(Number(r.growth_n3)),
  gm: pctStr(Number(r.gross_margin_pct)),
  smg: pctStr(Number(r.sm_growth)),
  smf: String(Number(r.sm_frozen_amount)),
  cash: String(Number(r.opening_cash)),
});

// Champs d'hypotheses editables : recalcul instantane, sans ecriture en base.
const PCT_FIELDS: { key: keyof Form; label: string }[] = [
  { key: 'g1', label: 'Croissance N+1 (%)' },
  { key: 'g2', label: 'Croissance N+2 (%)' },
  { key: 'g3', label: 'Croissance N+3 (%)' },
  { key: 'gm', label: 'Marge brute (%)' },
  { key: 'smg', label: 'Croissance S&M as is (%)' },
];
const AMOUNT_FIELDS: { key: keyof Form; label: string }[] = [
  { key: 'smf', label: 'S&M gelé rebound (K€)' },
  { key: 'cash', label: 'Trésorerie d’ouverture (K€)' },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card-soft p-3">
      <p className="text-xs font-medium text-ink/50">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/**
 * Section « Scénarios pluriannuels » de la page Budget : lecture prospective du budget
 * (as is / rebound) à partir du dernier P&L réalisé. Charge ses propres hypothèses
 * (table simulation_assumptions) et recalcule côté client, sans écrire en base.
 * `budgetYear` = année N+1 ; le dernier exercice réalisé N vaut budgetYear - 1.
 */
export function ScenariosSection({ pnlYears, budgetYear }: { pnlYears: PnlYearRow[] | null; budgetYear: number }) {
  const [row, setRow] = useState<SimulationAssumptionsRow | null | undefined>(undefined);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [mode, setMode] = useState<'asIs' | 'rebound'>('asIs');

  useEffect(() => {
    let cancelled = false;
    loadSimulationAssumptions()
      .then((r) => {
        if (cancelled) return;
        setRow(r);
        if (r) setForm(formFromRow(r));
      })
      .catch((e) => { if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  // Hypotheses live : valeurs seedees pour les champs non editables, formulaire pour le reste.
  const assumptions = useMemo<ScenarioAssumptions | null>(() => {
    if (!row || !form) return null;
    const base = toScenarioAssumptions(row);
    return {
      ...base,
      growth: [numOr(form.g1, 0) / 100, numOr(form.g2, 0) / 100, numOr(form.g3, 0) / 100],
      grossMarginPct: numOr(form.gm, 0) / 100,
      smGrowth: numOr(form.smg, 0) / 100,
      smFrozenAmount: numOr(form.smf, 0),
      openingCash: numOr(form.cash, 0),
    };
  }, [row, form]);

  // Historique realise, converti en K€ et decompose au meme format que les projections.
  const realized = useMemo(() => {
    if (!pnlYears || !assumptions || pnlYears.length === 0) return null;
    const sorted = [...pnlYears].sort((x, y) => x.year - y.year);
    const pnlK = sorted.map((p) => ({
      year: p.year,
      ca: Number(p.revenue) / 1000,
      sm: Number(p.sm) / 1000,
      otherCosts: (Number(p.tech_product) + Number(p.payroll_other) + Number(p.ga)) / 1000,
      da: Number(p.da) / 1000,
    }));
    const years = pnlK.map((p, i) =>
      realizedScenarioYear(p, i > 0 ? pnlK[i - 1].ca : null, assumptions.grossMarginPct),
    );
    return { pnlK, years };
  }, [pnlYears, assumptions]);

  const result = useMemo(() => {
    if (!assumptions || !realized) return null;
    const last = realized.years[realized.years.length - 1];
    const historyN: ScenarioHistoryYearN = { ca: last.ca, sm: last.sm, structure: last.structure };
    return projectScenarios(historyN, assumptions);
  }, [assumptions, realized]);

  if (loadErr) {
    return <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</div>;
  }
  if (row === undefined) {
    return <p className="mt-4 text-sm text-ink/50">Chargement des scénarios...</p>;
  }
  if (row === null) {
    return (
      <div className="mt-4 rounded-2xl border border-lav bg-white p-6 text-sm text-ink/70">
        <p className="font-semibold text-ink">Aucune hypothèse de simulation n’est renseignée pour cette société.</p>
        <p className="mt-2">
          La projection pluriannuelle a besoin d’un jeu d’hypothèses (croissance, marge brute, trajectoire du S&amp;M,
          trésorerie d’ouverture, base clients). Une fois ces hypothèses saisies en base, les deux scénarios se
          projettent automatiquement à partir du dernier exercice réalisé.
        </p>
      </div>
    );
  }
  if (!assumptions || !realized || !result || !form) {
    return <p className="mt-4 text-sm text-ink/50">Chargement des scénarios...</p>;
  }

  const lastYear = realized.pnlK[realized.pnlK.length - 1].year;
  const scenario = mode === 'asIs' ? result.asIs : result.rebound;
  const cols = [
    ...realized.years.map((y, i) => ({ year: realized.pnlK[i].year, kind: 'Réalisé' as const, y })),
    ...scenario.years.map((y, i) => ({ year: lastYear + 1 + i, kind: 'Projeté' as const, y })),
  ];
  const proj = scenario.years;
  const chartPoints: ScenarioChartPoint[] = proj.map((_, i) => ({
    label: String(lastYear + 1 + i),
    asIs: result.asIs.years[i].closingCash,
    rebound: result.rebound.years[i].closingCash,
    opening: assumptions.openingCash,
  }));

  return (
    <div className="mt-4 space-y-6">
      {/* Bascule de scenario */}
      <div className="inline-flex rounded-full bg-card-soft p-1" role="tablist" aria-label="Scénario">
        {([['asIs', 'As is'], ['rebound', 'Rebound']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${mode === key ? 'bg-primary text-white' : 'text-ink hover:bg-lav'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panneau d'hypotheses editables : recalcul instantane cote client, sans ecriture. */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">Hypothèses</h3>
          <button onClick={() => setForm(formFromRow(row))} className={btnSecondary}>Réinitialiser</button>
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Ajustez pour explorer : le recalcul est instantané et n’écrit rien en base. « Réinitialiser » restaure les valeurs de référence.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...PCT_FIELDS, ...AMOUNT_FIELDS].map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">{f.label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, [f.key]: e.target.value } : prev))}
                className={`w-full text-right ${inputBase}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Tableau annuel N-2 a N+3 */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h3 className="px-5 pt-5 font-semibold text-ink">P&amp;L annuel projeté (K€)</h3>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">Ligne</th>
                {cols.map((c) => (
                  <th key={c.year} className="px-4 py-3 text-right font-semibold">
                    <div className={c.kind === 'Projeté' ? 'text-primary' : ''}>{c.year}</div>
                    <div className="text-[10px] font-medium normal-case text-ink/40">{c.kind}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((r) => (
                <tr key={r.label} className={r.kind === 'solde' ? 'bg-lav' : ''}>
                  <td className={`sticky left-0 z-10 px-5 py-1.5 ${r.kind === 'solde' ? 'bg-lav font-semibold' : r.kind === 'sub' ? 'bg-white italic text-ink/50' : 'bg-white'}`}>
                    <span className="inline-flex items-center gap-1">{r.label}{r.info && <InfoTip text={r.info} />}</span>
                  </td>
                  {cols.map((c) => {
                    const { text, neg } = r.cell(c.y);
                    return (
                      <td key={c.year} className={`px-4 py-1.5 text-right tabular-nums ${r.kind === 'solde' ? 'font-semibold' : ''} ${r.kind === 'sub' ? 'italic text-ink/50' : ''} ${neg ? 'text-red-600' : ''}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-2 text-xs text-ink/50">
          Colonnes « Projeté » : scénario {mode === 'asIs' ? '« as is »' : '« rebound »'} sélectionné. Décomposition des coûts variables et de la structure par convention de marge brute.
        </p>
      </div>

      {/* Bloc tresorerie du scenario actif */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
          <h3 className="font-semibold text-ink">Trésorerie projetée (K€)</h3>
          {scenario.depletionMonths !== null && (
            <Badge tone="peach">Épuisement à ~{Math.round(scenario.depletionMonths)} mois</Badge>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-5 py-3 font-semibold">Ligne</th>
                {proj.map((_, i) => (<th key={i} className="px-5 py-3 text-right font-semibold">{lastYear + 1 + i}</th>))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-lav/60">
                <td className="px-5 py-1.5">Trésorerie d’ouverture</td>
                {proj.map((y, i) => (<td key={i} className="px-5 py-1.5 text-right tabular-nums">{kEur(y.openingCash)}</td>))}
              </tr>
              <tr className="border-b border-lav/60">
                <td className="px-5 py-1.5">
                  <span className="inline-flex items-center gap-1">Flux opérationnel<InfoTip text="Approximé par l’EBITDA (BFR neutre, capex non significatif)." /></span>
                </td>
                {proj.map((y, i) => (<td key={i} className={`px-5 py-1.5 text-right tabular-nums ${y.cashFlow < 0 ? 'text-red-600' : ''}`}>{kEur(y.cashFlow)}</td>))}
              </tr>
              <tr className="bg-lav">
                <td className="px-5 py-1.5 font-semibold">Trésorerie de clôture</td>
                {proj.map((y, i) => (
                  <td key={i} className={`px-5 py-1.5 text-right font-semibold tabular-nums ${y.closingCash < 0 ? 'bg-peach text-ink' : ''}`}>
                    {kEur(y.closingCash)}
                    {y.closingCash < 0 && <div className="text-[10px] font-medium normal-case">trésorerie négative</div>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-2 text-xs text-ink/50">
          Flux opérationnel approximé par l’EBITDA, BFR neutre par prudence, capex non significatif. Vue annuelle : le profil infra-annuel relève du pilotage mensuel.
        </p>
      </div>

      {/* Effort d'acquisition equivalent : scenario rebound uniquement */}
      {mode === 'rebound' && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink">L’effort traduit en CAC</h3>
            <InfoTip text="Ce que le S&M gelé impose : acquérir assez de clients pour porter la croissance du CA et compenser le churn, à budget constant." />
          </div>
          <p className="mt-1 text-xs text-ink/50">
            À S&amp;M gelé, tenir la croissance de N+1 revient à acquérir un volume de clients (celui de l’année N) pour un CAC équivalent donné.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="ARR à ajouter (K€)" value={kEur(result.cacEffort.deltaArr)} />
            <Stat label="Ajouts nets (clients)" value={Math.round(result.cacEffort.netAdds).toLocaleString('fr-FR')} />
            <Stat label="Churnés à compenser" value={Math.round(result.cacEffort.churned).toLocaleString('fr-FR')} />
            <Stat label="Clients bruts à acquérir" value={Math.round(result.cacEffort.gross).toLocaleString('fr-FR')} />
            <Stat label="CAC équivalent" value={fmtEur(result.cacEffort.cacEquivalent)} />
          </div>
          {row.cac_trajectory && row.cac_trajectory.length > 0 && (
            <p className="mt-4 text-xs text-ink/60">
              Trajectoire trimestrielle de CAC visée (rappel de configuration) :{' '}
              <span className="font-semibold text-ink">{row.cac_trajectory.map((c) => fmtEur(Number(c))).join(' → ')}</span>.
            </p>
          )}
        </div>
      )}

      {/* Comparaison des deux trajectoires de tresorerie */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-ink">Trésorerie de clôture : as is vs rebound</h3>
        <ScenarioChart points={chartPoints} />
      </div>
    </div>
  );
}
