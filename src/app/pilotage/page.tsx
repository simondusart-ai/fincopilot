'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, inputBase, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { buildConsolidationInputs, loadActuals, type ActualsData, type PnlYearRow } from '@/lib/data';
import { computeActuals, consolidate, type ActualMonthResult, type ActualsResult } from '@/lib/engine';
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

const METRIC_ROWS: { label: string; solde?: boolean; fmt: (r: ActualMonthResult) => string }[] = [
  { label: 'MRR fin de mois (k€)', solde: true, fmt: (r) => Math.round(r.mrrEnd / 1000).toLocaleString('fr-FR') },
  { label: 'Ajouts nets', fmt: (r) => r.netAdds.toLocaleString('fr-FR') },
  { label: 'Churn logo (%)', fmt: (r) => (r.monthlyLogoChurn === null ? '' : fmtPct(r.monthlyLogoChurn, 1)) },
  { label: 'ARPA implicite (€)', fmt: (r) => (r.arpaImplicit === null ? '' : fmtEur(r.arpaImplicit)) },
  { label: 'Croissance MRR (MoM)', fmt: (r) => (r.mrrGrowthMoM === null ? '' : fmtPct(r.mrrGrowthMoM, 1)) },
  { label: 'Croissance MRR (vs n-1)', fmt: (r) => (r.mrrGrowthYoY === null ? '' : fmtPct(r.mrrGrowthYoY, 1)) },
  { label: 'NRR', fmt: (r) => (r.nrr === null ? '' : fmtPct(r.nrr)) },
  { label: 'CAC moyen (€)', fmt: (r) => (r.cacAvg === null ? '' : fmtEur(r.cacAvg)) },
  { label: 'Marge de contribution (%)', fmt: (r) => (r.contributionMarginPct === null ? '' : fmtPct(r.contributionMarginPct)) },
  { label: 'Burn (k€)', fmt: (r) => (r.burn === null ? '' : Math.round(r.burn / 1000).toLocaleString('fr-FR')) },
  { label: 'Runway (mois)', solde: true, fmt: (r) => (r.runwayMonths === null ? '' : r.runwayMonths.toFixed(1)) },
];

const PNL_LINES: { label: string; key: keyof PnlYearRow; budget?: 'revenue' | 'ebitda'; solde?: boolean }[] = [
  { label: 'Revenu', key: 'revenue', budget: 'revenue', solde: true },
  { label: 'S&M', key: 'sm' },
  { label: 'Tech & Product', key: 'tech_product' },
  { label: 'Masse salariale & autres', key: 'payroll_other' },
  { label: 'G&A', key: 'ga' },
  { label: 'EBITDA', key: 'ebitda', budget: 'ebitda', solde: true },
  { label: 'D&A', key: 'da' },
  { label: 'Résultat net', key: 'net_income', solde: true },
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
    const baseParams = {
      arpa: Number(data.company.arpa),
      grossMarginPct: Number(data.company.gross_margin_pct),
      runwayVigilanceMonths: Number(data.company.runway_vigilance_months),
      runwayFreezeMonths: Number(data.company.runway_freeze_months),
      cacAvgTarget: data.company.cac_avg_target != null ? Number(data.company.cac_avg_target) : null,
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
    const resPrev = computeActuals({ ...baseParams, openingClients: Number(data.company.opening_clients) }, prevMonths, chOf(minYear));
    const resBudget = computeActuals(
      { ...baseParams, openingClients: resPrev.endBaseClients ?? Number(data.company.opening_clients) },
      monthsOf(minYear + 1),
      chOf(minYear + 1),
      prevMonths,
    );
    const resByYear: Record<number, ActualsResult> = { [minYear]: resPrev, [minYear + 1]: resBudget };
    return { resByYear };
  }, [data, actuals]);

  // Pont vers le budget : CA et EBITDA totaux issus de la consolidation des navettes.
  const budget = useMemo(() => {
    if (!data) return null;
    const r = consolidate(buildConsolidationInputs(data));
    return r.ok ? { revenue: r.totals!.revenue, ebitda: r.totals!.ebitda } : null;
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

  const target = data.company.cac_avg_target != null ? Number(data.company.cac_avg_target) : null;
  const freeze = Number(data.company.runway_freeze_months);
  const vigilance = Number(data.company.runway_vigilance_months);

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
          {/* 1. Tuiles du dernier mois saisi */}
          {lastMonth ? (
            <>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/50">
                Dernier mois saisi : {MONTH_LABELS[lastMonth.month - 1]} {selectedYear}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card title="MRR fin de mois" value={fmtKEur(lastMonth.mrrEnd)} hint={`Ajouts nets : ${lastMonth.netAdds.toLocaleString('fr-FR')}`} dot={lastMonth.netAdds >= 0} />
                <Card title="Croissance MRR (MoM)" value={lastMonth.mrrGrowthMoM === null ? 'n.a.' : fmtPct(lastMonth.mrrGrowthMoM, 1)} hint={lastMonth.mrrGrowthYoY === null ? undefined : `vs n-1 : ${fmtPct(lastMonth.mrrGrowthYoY, 1)}`} />
                <Card title="NRR" value={lastMonth.nrr === null ? 'n.a.' : fmtPct(lastMonth.nrr)} hint={lastMonth.nrrIsProxy ? 'Proxy annualisé' : 'Mesuré'} />
                <Card title="CAC moyen" value={lastMonth.cacAvg === null ? 'n.a.' : fmtEur(lastMonth.cacAvg)} hint={target !== null ? `Cible ${fmtEur(target)}` : undefined} tone={lastMonth.cacAvg !== null && target !== null && lastMonth.cacAvg > target ? 'bad' : 'default'} />
                <Card title="Marge de contribution" value={lastMonth.contributionMarginPct === null ? 'n.a.' : fmtPct(lastMonth.contributionMarginPct)} tone={lastMonth.contributionMarginPct !== null && lastMonth.contributionMarginPct < 0 ? 'bad' : 'default'} />
                <Card title="Burn du mois" value={lastMonth.burn === null ? 'n.a.' : fmtKEur(lastMonth.burn)} />
                <Card title="Runway" value={fmtMonths(lastMonth.runwayMonths)} hint={`Seuils : vigilance ${vigilance} mois, gel ${freeze} mois`} tone={lastMonth.runwayMonths !== null && lastMonth.runwayMonths < freeze ? 'bad' : 'default'} />
              </div>
            </>
          ) : (
            <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-ink/60 shadow-sm">
              Aucune donnée saisie pour {selectedYear}.{isCfo ? ' Utilisez la grille de saisie ci-dessous.' : ''}
            </p>
          )}

          {/* Alertes de gestion du dernier mois saisi */}
          {shownAlerts.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-ink">Alertes de gestion ({shownAlerts.length}) : à arbitrer, jamais bloquantes</h2>
              <ul className="mt-3 space-y-2">
                {shownAlerts.map((a, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-peach px-4 py-3 text-sm text-ink">
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">{a.code}</span>
                    {alertsFromPreviousMonth && (
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">Mois précédent</span>
                    )}
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            </div>
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
                    {METRIC_ROWS.map(({ label, solde, fmt }) => (
                      <tr key={label} className={solde ? 'bg-lav' : 'border-b border-lav/60'}>
                        <td className={`sticky left-0 z-10 px-5 py-1.5 ${solde ? 'bg-lav font-semibold' : 'bg-white'}`}>{label}</td>
                        {MONTH_LABELS.map((_, i) => {
                          const r = byMonth.get(i + 1);
                          return (
                            <td key={i} className={`px-3 py-1.5 text-right tabular-nums ${solde ? 'font-semibold' : ''}`}>
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

          {/* 3. Historique P&L annuel + pont budget */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="px-5 pt-5 font-semibold text-ink">P&amp;L annuel réalisé (k€)</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-5 py-3 font-semibold">Ligne</th>
                    {actuals.pnlYears.map((py) => (<th key={py.year} className="px-5 py-3 text-right font-semibold">{py.year}</th>))}
                    <th className="px-5 py-3 text-right font-semibold">Budget {data.company.budget_year}</th>
                  </tr>
                </thead>
                <tbody>
                  {actuals.pnlYears.length === 0 ? (
                    <tr><td className="px-5 py-3 text-ink/50" colSpan={2}>Aucun historique annuel pour cette société.</td></tr>
                  ) : (
                    PNL_LINES.map((line) => (
                      <tr key={line.key} className={line.solde ? 'bg-lav' : 'border-b border-lav/60'}>
                        <td className={`px-5 py-1.5 ${line.solde ? 'font-semibold' : ''}`}>{line.label}</td>
                        {actuals.pnlYears.map((py) => {
                          const v = Number(py[line.key]) / 1000;
                          return (
                            <td key={py.year} className={`px-5 py-1.5 text-right tabular-nums ${v < 0 ? 'text-red-600' : ''} ${line.solde ? 'font-semibold' : ''}`}>
                              {Math.round(v).toLocaleString('fr-FR')}
                            </td>
                          );
                        })}
                        <td className={`px-5 py-1.5 text-right tabular-nums ${line.solde ? 'font-semibold' : ''}`}>
                          {line.budget && budget ? (() => { const v = budget[line.budget] / 1000; return <span className={v < 0 ? 'text-red-600' : ''}>{Math.round(v).toLocaleString('fr-FR')}</span>; })() : <span className="text-ink/40">-</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 pt-2 text-xs text-ink/50">
              Colonne budget : CA et EBITDA totaux issus de la consolidation des navettes soumises.
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
