'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Badge, ErrorBox, Loading, Page, btnPrimary, inputBase, usePortalData } from '@/components/shell';
import { InfoTip } from '@/components/info-tip';
import { KpiCardPilotage } from '@/components/kpi-card-pilotage';
import { AlertBanners } from '@/components/alert-banner';
import { getSupabase } from '@/lib/supabase';
import { buildConsolidationInputs, loadActuals, type ActualsData } from '@/lib/data';
import { budgetAnnualPnl, computeActuals, consolidate, realizedAnnualPnl, type ActualMonthResult, type ActualsResult, type AnnualPnl } from '@/lib/engine';
import { MONTH_LABELS, fmtEur, fmtKEur, fmtMonths, fmtPct } from '@/lib/format';

interface MonthlyForm {
  newClients: string;
  churnedClients: string;
  mrrEnd: string;
  revenueMonth: string;
  smSpend: string;
  cashEnd: string;
  nrrMeasured: string;
}
const EMPTY_MONTH: MonthlyForm = { newClients: '', churnedClients: '', mrrEnd: '', revenueMonth: '', smSpend: '', cashEnd: '', nrrMeasured: '' };
interface ChForm { spend: string; newCustomers: string }

const MONTHLY_FIELDS: { key: keyof MonthlyForm; label: string }[] = [
  { key: 'newClients', label: 'Nouveaux' },
  { key: 'churnedClients', label: 'Churnés' },
  { key: 'mrrEnd', label: 'MRR fin (€)' },
  { key: 'revenueMonth', label: 'CA du mois (€)' },
  { key: 'smSpend', label: 'Dépenses S&M (€)' },
  { key: 'cashEnd', label: 'Trésorerie fin (€)' },
  { key: 'nrrMeasured', label: 'NRR mesuré' },
];

const kK = (v: number) => Math.round(v / 1000).toLocaleString('fr-FR');
const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${fmtPct(v, 1)}`;

// Ordre coherent avec les tuiles. Les lignes 'sub' sont des sous-lignes italiques grises.
const METRIC_ROWS: { label: string; solde?: boolean; sub?: boolean; fmt: (r: ActualMonthResult) => string }[] = [
  { label: 'MRR fin de mois (k€)', solde: true, fmt: (r) => kK(r.mrrEnd) },
  { label: 'croissance m/m', sub: true, fmt: (r) => (r.mrrGrowthMoM === null ? '' : signedPct(r.mrrGrowthMoM)) },
  { label: 'Nouveaux clients', fmt: (r) => r.newClients.toLocaleString('fr-FR') },
  { label: 'Clients churnés', fmt: (r) => r.churnedClients.toLocaleString('fr-FR') },
  { label: 'churn logo (%)', sub: true, fmt: (r) => (r.monthlyLogoChurn === null ? '' : fmtPct(r.monthlyLogoChurn, 1)) },
  { label: 'Ajouts nets', fmt: (r) => r.netAdds.toLocaleString('fr-FR') },
  { label: 'ARPA implicite (€)', fmt: (r) => (r.arpaImplicit === null ? '' : fmtEur(r.arpaImplicit)) },
  { label: 'NRR', fmt: (r) => (r.nrr === null ? '' : fmtPct(r.nrr)) },
  { label: 'CAC moyen (€)', fmt: (r) => (r.cacAvg === null ? '' : fmtEur(r.cacAvg)) },
  { label: 'Marge de contribution (%)', fmt: (r) => (r.contributionMarginPct === null ? '' : fmtPct(r.contributionMarginPct)) },
  { label: 'Burn (k€)', fmt: (r) => (r.burn === null ? '' : kK(r.burn)) },
  { label: 'Runway (mois)', solde: true, fmt: (r) => (r.runwayMonths === null ? '' : r.runwayMonths.toFixed(1)) },
];

// P&L annuel a la structure du Budget. 'solde' = fond lavande ; 'pct' = sous-ligne grise.
const ANNUAL_PNL_ROWS: { label: string; kind: 'line' | 'solde' | 'pct'; get: (p: AnnualPnl) => number; info?: string }[] = [
  { label: 'Chiffre d’affaires', kind: 'line', get: (p) => p.revenue },
  { label: 'COGS', kind: 'line', get: (p) => -p.cogs, info: 'Convention marge brute 70 % pour les années réalisées.' },
  { label: 'Marge brute', kind: 'solde', get: (p) => p.grossMargin },
  { label: 'Marge brute (%)', kind: 'pct', get: (p) => (p.revenue ? p.grossMargin / p.revenue : NaN) },
  { label: 'Coûts S&M', kind: 'line', get: (p) => -p.sm },
  { label: 'Marge de contribution', kind: 'solde', get: (p) => p.contribution },
  { label: 'Marge de contribution (%)', kind: 'pct', get: (p) => (p.revenue ? p.contribution / p.revenue : NaN) },
  { label: 'Coûts de structure (salaires et opex)', kind: 'line', get: (p) => -p.structure },
  { label: 'EBITDA', kind: 'solde', get: (p) => p.ebitda },
  { label: 'Marge EBITDA (%)', kind: 'pct', get: (p) => (p.revenue ? p.ebitda / p.revenue : NaN) },
];

export default function PilotagePage() {
  const { data, error, loading } = usePortalData();
  const [actuals, setActuals] = useState<ActualsData | null>(null);
  const [actualsErr, setActualsErr] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [grid, setGrid] = useState<Record<number, MonthlyForm>>({});
  const [chGrid, setChGrid] = useState<Record<string, ChForm>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    loadActuals()
      .then((a) => { if (!cancelled) setActuals(a); })
      .catch((e) => { if (!cancelled) setActualsErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [data]);

  const years = data ? [data.company.budget_year - 1, data.company.budget_year] : [];
  const selectedYear = year ?? years[0] ?? null;
  const isCfo = data?.profile.role === 'cfo';

  // Indicateurs realises calcules par le moteur, pour les deux annees.
  const compute = useMemo(() => {
    if (!data || !actuals) return null;
    const minYear = data.company.budget_year - 1;
    // Cible de CAC moyen = MOYENNE des plafonds par canal fixes dans le Budget (par le CFO/CEO),
    // et non une valeur codee en dur. Elle appartient a l'exercice budgetaire : on ne l'applique
    // donc qu'a l'annee budgetee, jamais aux annees realisees anterieures (voir plus bas).
    const caps = data.channels.map((c) => c.cac_cap).filter((v): v is number => v != null).map(Number);
    const cacTargetBudget = caps.length > 0 ? caps.reduce((a, b) => a + b, 0) / caps.length : null;
    const baseParams = {
      arpa: Number(data.company.arpa),
      grossMarginPct: Number(data.company.gross_margin_pct),
      runwayVigilanceMonths: Number(data.company.runway_vigilance_months),
      runwayFreezeMonths: Number(data.company.runway_freeze_months),
      channels: data.channels.map((c) => ({ id: c.id, name: c.name, cacCap: c.cac_cap != null ? Number(c.cac_cap) : null })),
    };
    const monthsOf = (y: number) =>
      actuals.monthlyActuals
        .filter((r) => r.year === y)
        .map((r) => ({
          month: Number(r.month),
          newClients: Number(r.new_clients),
          churnedClients: Number(r.churned_clients),
          mrrEnd: Number(r.mrr_end),
          revenueMonth: r.revenue_month != null ? Number(r.revenue_month) : null,
          smSpend: Number(r.sm_spend),
          cashEnd: r.cash_end != null ? Number(r.cash_end) : null,
          nrrMeasured: r.nrr_measured != null ? Number(r.nrr_measured) : null,
        }));
    const chOf = (y: number) =>
      actuals.channelActuals
        .filter((r) => r.year === y)
        .map((r) => ({ channelId: r.channel_id, month: Number(r.month), spend: Number(r.spend), newCustomers: Number(r.new_customers) }));

    const prevMonths = monthsOf(minYear);
    // Annee realisee anterieure : aucune cible de CAC (la cible est fixee sur l'exercice budgete).
    const resPrev = computeActuals({ ...baseParams, cacAvgTarget: null, openingClients: Number(data.company.opening_clients) }, prevMonths, chOf(minYear));
    // Annee budgetee : la cible = moyenne des plafonds par canal.
    const resBudget = computeActuals(
      { ...baseParams, cacAvgTarget: cacTargetBudget, openingClients: resPrev.endBaseClients ?? Number(data.company.opening_clients) },
      monthsOf(minYear + 1),
      chOf(minYear + 1),
      prevMonths,
    );
    const resByYear: Record<number, ActualsResult> = { [minYear]: resPrev, [minYear + 1]: resBudget };
    return { resByYear, cacTargetBudget };
  }, [data, actuals]);

  // Pont vers le budget : P&L annuel issu de la consolidation des navettes (memes lignes).
  const budget = useMemo((): AnnualPnl | null => {
    if (!data) return null;
    const r = consolidate(buildConsolidationInputs(data));
    if (!r.ok) return null;
    const smAnnual = r.months.reduce((a, m) => a + m.smSpend, 0);
    const sgnaAnnual = r.months.reduce((a, m) => a + m.payrollTotal + m.opexTotal, 0);
    return budgetAnnualPnl(r.totals!, smAnnual, sgnaAnnual);
  }, [data]);

  // Pre-remplit les grilles de saisie depuis les donnees de l'annee selectionnee.
  useEffect(() => {
    if (!data || !actuals || selectedYear == null) return;
    const rows = actuals.monthlyActuals.filter((r) => r.year === selectedYear);
    const g: Record<number, MonthlyForm> = {};
    for (let m = 1; m <= 12; m++) {
      const r = rows.find((x) => Number(x.month) === m);
      g[m] = r
        ? {
            newClients: String(r.new_clients),
            churnedClients: String(r.churned_clients),
            mrrEnd: String(r.mrr_end),
            revenueMonth: r.revenue_month != null ? String(r.revenue_month) : '',
            smSpend: String(r.sm_spend),
            cashEnd: r.cash_end != null ? String(r.cash_end) : '',
            nrrMeasured: r.nrr_measured != null ? String(r.nrr_measured) : '',
          }
        : { ...EMPTY_MONTH };
    }
    setGrid(g);
    const cg: Record<string, ChForm> = {};
    for (const c of data.channels) {
      for (let m = 1; m <= 12; m++) {
        const r = actuals.channelActuals.find((x) => x.channel_id === c.id && x.year === selectedYear && Number(x.month) === m);
        cg[`${c.id}:${m}`] = r ? { spend: String(r.spend), newCustomers: String(r.new_customers) } : { spend: '', newCustomers: '' };
      }
    }
    setChGrid(cg);
    setMsg(null);
  }, [data, actuals, selectedYear]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  const selectedRes = compute && selectedYear != null ? compute.resByYear[selectedYear] : null;
  const byMonth = new Map((selectedRes?.months ?? []).map((r) => [r.month, r]));
  const lastMonth = selectedRes && selectedRes.months.length ? selectedRes.months[selectedRes.months.length - 1] : null;
  // Alertes : seulement celles du dernier mois saisi. Si ce mois n'en produit aucune,
  // on retombe sur le mois precedent, signale comme tel.
  const noMonthsSaved = (selectedRes?.months.length ?? 0) === 0;
  const lastMonthNum = lastMonth?.month ?? null;
  const allAlerts = selectedRes?.alerts ?? [];
  const alertsLast = lastMonthNum ? allAlerts.filter((a) => a.month === lastMonthNum) : [];
  const alertsPrev = lastMonthNum && lastMonthNum > 1 ? allAlerts.filter((a) => a.month === lastMonthNum - 1) : [];
  const shownAlerts = alertsLast.length > 0 ? alertsLast : alertsPrev;
  const alertsFromPreviousMonth = alertsLast.length === 0 && alertsPrev.length > 0;

  // Cible de CAC affichee : uniquement sur l'exercice budgete (moyenne des plafonds par canal).
  const target = selectedYear === data.company.budget_year ? (compute?.cacTargetBudget ?? null) : null;
  const freeze = Number(data.company.runway_freeze_months);
  const vigilance = Number(data.company.runway_vigilance_months);

  // P&L annuel a la structure du Budget. COGS des annees realisees deduits au taux de marge.
  const cogsRate = 1 - Number(data.company.gross_margin_pct);
  const realizedByYear = (actuals?.pnlYears ?? []).map((py) => ({
    year: py.year,
    pnl: realizedAnnualPnl(
      { revenue: Number(py.revenue), sm: Number(py.sm), techProduct: Number(py.tech_product), payrollOther: Number(py.payroll_other), ga: Number(py.ga) },
      cogsRate,
    ),
  }));

  async function save() {
    if (!data || selectedYear == null) return;
    setBusy(true);
    setMsg(null);
    try {
      const supabase = getSupabase();
      const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
      const numN = (s: string) => (s.trim() === '' ? null : Number(s));

      const monthlyRows = [];
      for (let m = 1; m <= 12; m++) {
        const f = grid[m];
        if (!f || !Object.values(f).some((v) => v.trim() !== '')) continue;
        monthlyRows.push({
          company_id: data.company.id,
          year: selectedYear,
          month: m,
          new_clients: num(f.newClients),
          churned_clients: num(f.churnedClients),
          mrr_end: num(f.mrrEnd),
          revenue_month: numN(f.revenueMonth),
          sm_spend: num(f.smSpend),
          cash_end: numN(f.cashEnd),
          nrr_measured: numN(f.nrrMeasured),
        });
      }
      if (monthlyRows.length > 0) {
        const { error: e } = await supabase.from('monthly_actuals').upsert(monthlyRows, { onConflict: 'company_id,year,month' });
        if (e) throw new Error(e.message);
      }

      const chRows = [];
      for (const c of data.channels) {
        for (let m = 1; m <= 12; m++) {
          const f = chGrid[`${c.id}:${m}`];
          if (!f || (f.spend.trim() === '' && f.newCustomers.trim() === '')) continue;
          chRows.push({ company_id: data.company.id, channel_id: c.id, year: selectedYear, month: m, spend: num(f.spend), new_customers: num(f.newCustomers) });
        }
      }
      if (chRows.length > 0) {
        const { error: e } = await supabase.from('channel_actuals').upsert(chRows, { onConflict: 'channel_id,year,month' });
        if (e) throw new Error(e.message);
      }

      setMsg(`Pilotage ${selectedYear} enregistré : les indicateurs sont recalculés.`);
      setActuals(await loadActuals());
    } catch (e) {
      setMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page data={data}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Pilotage des indicateurs</h1>
          <p className="mt-1 text-sm text-ink/60">
            Suivi mensuel du réalisé et pont vers le budget. Alertes de gestion, jamais bloquantes.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink/60">Exercice</span>
          <select value={selectedYear ?? ''} onChange={(e) => setYear(Number(e.target.value))} className={`bg-white ${inputBase}`}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}{y === data.company.budget_year ? ' (budget)' : ' (réalisé)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {actualsErr && <div className="mt-4"><ErrorBox message={actualsErr} /></div>}
      {!actuals ? (
        <Loading />
      ) : (
        <>
          {/* 1. Cartes d'indicateurs : toujours affichees ; "-" tant que rien n'est saisi. */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-lav px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 2.5v4M16 2.5v4" />
            </svg>
            {lastMonth ? `Dernier mois saisi : ${MONTH_LABELS[lastMonth.month - 1]} ${selectedYear}` : `Exercice ${selectedYear} : aucun mois saisi`}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <KpiCardPilotage
              dimension="croissance"
              icon="curve"
              title="MRR"
              value={lastMonth ? fmtKEur(lastMonth.mrrEnd) : '-'}
              sub={lastMonth ? `Ajouts nets : ${lastMonth.netAdds.toLocaleString('fr-FR')}${lastMonth.monthlyLogoChurn !== null ? ` après ${fmtPct(lastMonth.monthlyLogoChurn, 1)} de churn sur le mois` : ''}` : undefined}
              italic={lastMonth && lastMonth.mrrGrowthMoM !== null ? `${signedPct(lastMonth.mrrGrowthMoM)} vs mois précédent` : undefined}
            />
            <KpiCardPilotage
              dimension="croissance"
              icon="loop"
              title="NRR"
              value={lastMonth ? (lastMonth.nrr === null ? 'n.a.' : fmtPct(lastMonth.nrr)) : '-'}
              sub={lastMonth && lastMonth.nrrIsProxy ? 'Proxy annualisé' : undefined}
            />
            <KpiCardPilotage
              dimension="rentabilite"
              icon="target"
              title="CAC moyen"
              value={lastMonth ? (lastMonth.cacAvg === null ? 'n.a.' : fmtEur(lastMonth.cacAvg)) : '-'}
              sub={target !== null ? `Cible ${fmtEur(target)}` : undefined}
              bad={!!lastMonth && lastMonth.cacAvg !== null && target !== null && lastMonth.cacAvg > target}
            />
            <KpiCardPilotage
              dimension="rentabilite"
              icon="gauge"
              title="Marge de contribution"
              value={lastMonth ? (lastMonth.contributionMarginPct === null ? 'n.a.' : fmtPct(lastMonth.contributionMarginPct)) : '-'}
              sub={lastMonth ? '% du CA' : undefined}
              bad={!!lastMonth && lastMonth.contributionMarginPct !== null && lastMonth.contributionMarginPct < 0}
            />
            <KpiCardPilotage
              dimension="cash"
              icon="flame"
              title="Burn du mois"
              value={lastMonth ? (lastMonth.burn === null ? 'n.a.' : fmtKEur(lastMonth.burn)) : '-'}
              sub={lastMonth && lastMonth.cashEnd !== null ? `Trésorerie : ${fmtKEur(lastMonth.cashEnd)}` : undefined}
            />
            <KpiCardPilotage
              dimension="cash"
              icon="pump"
              title="Runway"
              value={lastMonth ? fmtMonths(lastMonth.runwayMonths) : '-'}
              sub={`Seuils : vigilance ${vigilance} mois, gel ${freeze} mois`}
              bad={!!lastMonth && lastMonth.runwayMonths !== null && lastMonth.runwayMonths < freeze}
            />
          </div>
          {!lastMonth && isCfo && (
            <p className="mt-2 text-xs text-ink/50">Aucun mois saisi pour {selectedYear}. Utilisez la grille de saisie ci-dessous.</p>
          )}

          {/* Alertes de gestion du dernier mois saisi (titre harmonise avec l'ecran Budget) */}
          {lastMonth && (
            <section className="mt-8">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">Alertes de gestion</h2>
                <span className="rounded-full bg-lav px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">{shownAlerts.length}</span>
              </div>
              <AlertBanners
                alerts={shownAlerts}
                emptyMessage="Aucune alerte."
                periodFor={(a) => (a.month ? `${MONTH_LABELS[a.month - 1]} ${selectedYear}` : a.quarter ? `T${a.quarter}` : undefined)}
                extraTag={alertsFromPreviousMonth ? 'Mois précédent' : undefined}
              />
            </section>
          )}

          {/* 2. Tableau mensuel des indicateurs */}
          {selectedRes && (
            <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
              <h2 className="px-5 pt-5 font-semibold text-ink">Indicateurs mensuels {selectedYear}</h2>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full whitespace-nowrap text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">Indicateur</th>
                      {MONTH_LABELS.map((m) => (<th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ROWS.map(({ label, solde, sub, fmt }) => (
                      <tr key={label} className={solde ? 'bg-lav' : sub ? '' : 'border-b border-lav/60'}>
                        <td className={`sticky left-0 z-10 px-5 py-1.5 ${solde ? 'bg-lav font-semibold' : sub ? 'bg-white italic text-ink/50' : 'bg-white'}`}>{label}</td>
                        {MONTH_LABELS.map((_, i) => {
                          const r = byMonth.get(i + 1);
                          return (
                            <td key={i} className={`px-3 py-1.5 text-right tabular-nums ${solde ? 'font-semibold' : ''} ${sub ? 'italic text-ink/50' : ''}`}>
                              {r ? fmt(r) : noMonthsSaved ? <span className="text-ink/40">À venir</span> : ''}
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

          {/* 3. P&L annuel a la structure du Budget (realise + pont budget) */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="px-5 pt-5 font-semibold text-ink">P&amp;L annuel (k€)</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-5 py-3 font-semibold">Ligne</th>
                    {realizedByYear.map((y) => (<th key={y.year} className="px-5 py-3 text-right font-semibold">{y.year}</th>))}
                    <th className="px-5 py-3 text-right font-semibold">
                      <span className="inline-flex items-center gap-1 normal-case">Budget {data.company.budget_year}<InfoTip text="Issu de la consolidation des navettes soumises." /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {realizedByYear.length === 0 ? (
                    <tr><td className="px-5 py-3 text-ink/50" colSpan={2}>Aucun historique annuel pour cette société.</td></tr>
                  ) : (
                    ANNUAL_PNL_ROWS.map((row) => {
                      const solde = row.kind === 'solde';
                      const pct = row.kind === 'pct';
                      const cell = (v: number) => (pct ? (Number.isFinite(v) ? fmtPct(v) : 'n.a.') : Math.round(v / 1000).toLocaleString('fr-FR'));
                      return (
                        <tr key={row.label} className={solde ? 'bg-lav' : pct ? '' : 'border-b border-lav/60'}>
                          <td className={`px-5 py-1.5 ${solde ? 'font-semibold' : pct ? 'italic text-ink/50' : ''}`}>
                            <span className="inline-flex items-center gap-1">{row.label}{row.info && <InfoTip text={row.info} />}</span>
                          </td>
                          {realizedByYear.map((y) => {
                            const v = row.get(y.pnl);
                            return (
                              <td key={y.year} className={`px-5 py-1.5 text-right tabular-nums ${!pct && v < 0 ? 'text-red-600' : ''} ${solde ? 'font-semibold' : ''} ${pct ? 'italic text-ink/50' : ''}`}>
                                {cell(v)}
                              </td>
                            );
                          })}
                          <td className={`px-5 py-1.5 text-right tabular-nums ${solde ? 'font-semibold' : ''} ${pct ? 'italic text-ink/50' : ''}`}>
                            {budget ? (() => { const v = row.get(budget); return <span className={!pct && v < 0 ? 'text-red-600' : ''}>{cell(v)}</span>; })() : <span className="text-ink/40">-</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 pt-2 text-xs text-ink/50">
              Colonne budget : issue de la consolidation des navettes soumises. COGS des années réalisées : convention marge brute 70 %.
            </p>
          </div>

          {/* 4. Grille de saisie (CFO uniquement) */}
          {isCfo && (
            <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
                <h2 className="font-semibold text-ink">Saisie mensuelle {selectedYear}</h2>
                <Badge tone="accent">CFO</Badge>
              </div>
              <p className="px-5 pt-1 text-xs text-ink/50">Montants en euros. Un mois vide n&apos;est pas enregistré. Enregistrement par upsert sur (année, mois).</p>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-4 py-3 font-semibold">Mois</th>
                      {MONTHLY_FIELDS.map((f) => (<th key={f.key} className="px-3 py-3 text-right font-semibold">{f.label}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_LABELS.map((label, i) => {
                      const m = i + 1;
                      const f = grid[m] ?? EMPTY_MONTH;
                      return (
                        <tr key={m} className="border-b border-lav/60 last:border-0">
                          <td className="px-4 py-1.5 font-semibold text-ink">{label}</td>
                          {MONTHLY_FIELDS.map((fld) => (
                            <td key={fld.key} className="px-3 py-1.5 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={f[fld.key]}
                                onChange={(e) => setGrid((prev) => ({ ...prev, [m]: { ...(prev[m] ?? EMPTY_MONTH), [fld.key]: e.target.value } }))}
                                className={`w-28 text-right ${inputBase}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Detail par canal, repliable */}
              {data.channels.length > 0 && (
                <details className="border-t border-lav/60 px-5 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-primary">Détail par canal (dépenses et nouveaux clients)</summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                          <th className="px-3 py-3 font-semibold">Mois</th>
                          {data.channels.map((c) => (<th key={c.id} className="px-3 py-3 text-right font-semibold" colSpan={2}>{c.name}</th>))}
                        </tr>
                        <tr className="border-b border-lav text-left text-[11px] uppercase tracking-wide text-ink/40">
                          <th className="px-3 py-1"></th>
                          {data.channels.map((c) => (
                            <Fragment key={c.id}>
                              <th className="px-3 py-1 text-right font-medium">Dépenses (€)</th>
                              <th className="px-3 py-1 text-right font-medium">Nouveaux</th>
                            </Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MONTH_LABELS.map((label, i) => {
                          const m = i + 1;
                          return (
                            <tr key={m} className="border-b border-lav/60 last:border-0">
                              <td className="px-3 py-1.5 font-semibold text-ink">{label}</td>
                              {data.channels.map((c) => {
                                const key = `${c.id}:${m}`;
                                const f = chGrid[key] ?? { spend: '', newCustomers: '' };
                                return (
                                  <Fragment key={key}>
                                    <td className="px-3 py-1.5 text-right">
                                      <input type="text" inputMode="decimal" value={f.spend} onChange={(e) => setChGrid((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { spend: '', newCustomers: '' }), spend: e.target.value } }))} className={`w-24 text-right ${inputBase}`} />
                                    </td>
                                    <td className="px-3 py-1.5 text-right">
                                      <input type="text" inputMode="decimal" value={f.newCustomers} onChange={(e) => setChGrid((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { spend: '', newCustomers: '' }), newCustomers: e.target.value } }))} className={`w-20 text-right ${inputBase}`} />
                                    </td>
                                  </Fragment>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <div className="flex items-center gap-4 px-5 py-4">
                <button onClick={save} disabled={busy} className={btnPrimary}>
                  {busy ? 'Enregistrement...' : `Enregistrer le pilotage ${selectedYear}`}
                </button>
                {msg && <p className="text-sm text-ink/70">{msg}</p>}
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
