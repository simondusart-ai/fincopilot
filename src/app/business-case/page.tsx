'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, btnSecondary, inputBase, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';
import { computeBusinessCase, type BusinessCaseInput, type BusinessCaseYear } from '@/lib/engine';
import { fmtKEur, fmtMonths } from '@/lib/format';
import type { SubmissionRow } from '@/lib/data';

interface YearForm {
  revenue: string;
  recurringCosts: string;
  fte: string;
  monthlyCostPerFte: string;
  otherOpex: string;
  investment: string;
}
const emptyYear = (): YearForm => ({ revenue: '', recurringCosts: '', fte: '', monthlyCostPerFte: '', otherOpex: '', investment: '' });

const YEAR_FIELDS: { key: keyof YearForm; label: string; year1Only?: boolean }[] = [
  { key: 'revenue', label: 'Revenus (€)' },
  { key: 'recurringCosts', label: 'Coûts récurrents (€)' },
  { key: 'fte', label: 'ETP dédiés' },
  { key: 'monthlyCostPerFte', label: 'Coût mensuel / ETP (€)' },
  { key: 'otherOpex', label: 'Autres opex (€)' },
  { key: 'investment', label: 'Invest one-off (€)', year1Only: true },
];

const FLOW_ROWS: { label: string; solde?: boolean; get: (y: BusinessCaseYear) => number }[] = [
  { label: 'Revenus', get: (y) => y.revenue },
  { label: 'Coûts récurrents', get: (y) => -y.recurringCosts },
  { label: 'Salaires', get: (y) => -y.salaries },
  { label: 'Autres opex', get: (y) => -y.otherOpex },
  { label: 'Invest', get: (y) => -y.investment },
  { label: 'Cash-flow', solde: true, get: (y) => y.cashFlow },
  { label: 'Cumul', solde: true, get: (y) => y.cumulativeCashFlow },
  { label: 'Flux actualisé', get: (y) => y.discountedCashFlow },
];

function barPath(x: number, w: number, baselineY: number, valueY: number): string {
  const top = Math.min(valueY, baselineY);
  const bottom = Math.max(valueY, baselineY);
  const r = Math.min(6, w / 2, bottom - top);
  if (valueY <= baselineY) {
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${bottom} Z`;
  }
  return `M${x},${top} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${x + w - r},${bottom} Q${x + w},${bottom} ${x + w},${bottom - r} L${x + w},${top} Z`;
}

/** Barres de cash-flow annuel (mêmes conventions que le graphique du dashboard). */
function CashFlowBars({ years }: { years: BusinessCaseYear[] }) {
  const W = 520;
  const H = 220;
  const padL = 44;
  const padR = 16;
  const top = 20;
  const bottom = 176;
  const cfK = years.map((y) => y.cashFlow / 1000);
  const roundTo = (v: number, s: number, dir: 'ceil' | 'floor') => (dir === 'ceil' ? Math.ceil(v / s) : Math.floor(v / s)) * s;
  const raw = cfK.length ? cfK : [0];
  const step = Math.max(100, Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.max(...raw.map(Math.abs)))))) );
  const eMax = roundTo(Math.max(0, ...raw), step, 'ceil') || step;
  const eMin = roundTo(Math.min(0, ...raw), step, 'floor');
  const range = eMax - eMin || 1;
  const y = (v: number) => bottom - ((v - eMin) / range) * (bottom - top);
  const baseline = y(0);
  const slot = (W - padL - padR) / Math.max(1, years.length);
  const barW = Math.min(46, slot * 0.5);
  const cx = (i: number) => padL + slot * i + slot / 2;
  const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px]" role="img" aria-label="Cash-flow annuel">
        <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} stroke="var(--color-lav)" strokeWidth={1} />
        <text x={padL - 8} y={baseline + 3} textAnchor="end" fontSize={10} fill="var(--color-ink)" opacity={0.5}>0</text>
        {cfK.map((v, i) => {
          const positive = v >= 0;
          const labelY = positive ? y(v) - 6 : y(v) + 13;
          return (
            <g key={i}>
              <path d={barPath(cx(i) - barW / 2, barW, baseline, y(v))} fill={positive ? 'var(--color-primary)' : 'var(--color-lav)'} />
              <text x={cx(i)} y={labelY} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)">{fmt(v)}</text>
              <text x={cx(i)} y={H - 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)" opacity={0.6}>A{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function BusinessCasePage() {
  const { data, error, loading, reload } = usePortalData();
  const [label, setLabel] = useState('');
  const [horizon, setHorizon] = useState(3);
  const [ratePct, setRatePct] = useState('15');
  const [yrs, setYrs] = useState<YearForm[]>(() => Array.from({ length: 3 }, emptyYear));
  const [payrollTarget, setPayrollTarget] = useState('');
  const [opexTarget, setOpexTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [prefillMsg, setPrefillMsg] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? 0 : Number(s) || 0);

  const params: BusinessCaseInput = useMemo(
    () => ({
      label: label.trim() || 'Business case',
      horizonYears: horizon,
      discountRate: (Number(ratePct) || 0) / 100,
      years: Array.from({ length: horizon }, (_, i) => {
        const yf = yrs[i] ?? emptyYear();
        return {
          revenue: num(yf.revenue),
          recurringCosts: num(yf.recurringCosts),
          fte: num(yf.fte),
          monthlyCostPerFte: num(yf.monthlyCostPerFte),
          otherOpex: num(yf.otherOpex),
          investment: i === 0 ? num(yf.investment) : 0,
        };
      }),
    }),
    [label, horizon, ratePct, yrs],
  );
  const result = useMemo(() => computeBusinessCase(params), [params]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  function setHorizonSafe(n: number) {
    setHorizon(n);
    setYrs((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(emptyYear());
      return next.slice(0, Math.max(n, next.length));
    });
  }

  // Pre-remplissage : disponible pour un Head of dont la derniere navette est en brouillon.
  const myDeptId = data.profile.department_id;
  const myDraft: SubmissionRow | null = myDeptId
    ? data.submissions.filter((s) => s.department_id === myDeptId).sort((a, b) => b.version - a.version)[0] ?? null
    : null;
  const canPrefill = !!myDeptId && myDraft?.status === 'draft';
  const payrollDefs = data.driverDefs.filter((d) => d.department_id === myDeptId && d.kind === 'payroll');
  const opexDefs = data.driverDefs.filter((d) => d.department_id === myDeptId && d.kind === 'opex');
  const effPayroll = payrollTarget || payrollDefs[0]?.id || '';
  const effOpex = opexTarget || opexDefs[0]?.id || '';

  async function saveCase() {
    setBusy(true);
    setSaveMsg(null);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const { error: e } = await supabase.from('business_cases').insert({
        company_id: data!.company.id,
        department_id: data!.profile.department_id,
        label: params.label,
        params,
        created_by: auth.user!.id,
      });
      if (e) throw new Error(e.message);
      setSaveMsg(`Business case "${params.label}" enregistré.`);
    } catch (e) {
      setSaveMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function prefill() {
    if (!myDraft || myDraft.status !== 'draft') return;
    setBusy(true);
    setPrefillMsg(null);
    try {
      const supabase = getSupabase();
      const y1 = result.years[0];
      const salariesQ = y1 ? y1.salaries / 4 : 0;
      const opexQ = y1 ? y1.otherOpex / 4 : 0;
      const added: string[] = [];

      async function addToLine(defId: string, perQuarter: number, kindLabel: string) {
        if (!defId || perQuarter === 0) return;
        const def = data!.driverDefs.find((d) => d.id === defId);
        const existing = data!.lines.find((l) => l.submission_id === myDraft!.id && l.driver_def_id === defId);
        const base = existing ? [Number(existing.q1), Number(existing.q2), Number(existing.q3), Number(existing.q4)] : [0, 0, 0, 0];
        const row = {
          submission_id: myDraft!.id,
          driver_def_id: defId,
          q1: base[0] + perQuarter,
          q2: base[1] + perQuarter,
          q3: base[2] + perQuarter,
          q4: base[3] + perQuarter,
          unit_cost: existing?.unit_cost ?? null,
        };
        const { error: e } = await supabase.from('submission_lines').upsert(row, { onConflict: 'submission_id,driver_def_id' });
        if (e) throw new Error(e.message);
        added.push(`${Math.round(perQuarter).toLocaleString('fr-FR')} € par trimestre sur "${def?.label ?? kindLabel}"`);
      }

      await addToLine(effPayroll, salariesQ, 'salaires');
      await addToLine(effOpex, opexQ, 'opex');

      if (added.length === 0) {
        setPrefillMsg('Rien à ajouter : renseignez les salaires ou opex de l’année 1 et choisissez des lignes cibles.');
      } else {
        setPrefillMsg(`Navette v${myDraft.version} (brouillon) pré-remplie : ${added.join(' ; ')}. Les montants ont été ajoutés aux valeurs existantes.`);
        await reload();
      }
    } catch (e) {
      setPrefillMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page data={data}>
      <h1 className="text-2xl font-bold text-ink">Business case</h1>
      <p className="mt-1 text-sm text-ink/60">
        Chiffrage d&apos;un projet d&apos;investissement : cash-flows, VAN et payback, sur les mêmes conventions que le moteur. Constats calculés, aucune recommandation rédigée.
      </p>

      {/* Hypothèses */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="font-semibold text-ink">Intitulé du projet</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Offre CGP" className={`mt-1 block w-64 bg-white ${inputBase}`} />
          </label>
          <label className="text-sm">
            <span className="font-semibold text-ink">Horizon</span>
            <select value={horizon} onChange={(e) => setHorizonSafe(Number(e.target.value))} className={`mt-1 block bg-white ${inputBase}`}>
              {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n} an{n > 1 ? 's' : ''}</option>))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold text-ink">Taux d&apos;actualisation (%)</span>
            <input type="text" inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} className={`mt-1 block w-28 bg-white ${inputBase}`} />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-3 py-3 font-semibold">Année</th>
                {YEAR_FIELDS.map((f) => (<th key={f.key} className="px-3 py-3 text-right font-semibold">{f.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: horizon }, (_, i) => (
                <tr key={i} className="border-b border-lav/60 last:border-0">
                  <td className="px-3 py-1.5 font-semibold text-ink">A{i + 1}</td>
                  {YEAR_FIELDS.map((f) => (
                    <td key={f.key} className="px-3 py-1.5 text-right">
                      {f.year1Only && i > 0 ? (
                        <span className="text-ink/30">-</span>
                      ) : (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={(yrs[i] ?? emptyYear())[f.key]}
                          onChange={(e) => setYrs((prev) => { const next = [...prev]; next[i] = { ...(next[i] ?? emptyYear()), [f.key]: e.target.value }; return next; })}
                          className={`w-28 text-right ${inputBase}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Résultats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="VAN" value={fmtKEur(result.npv)} tone={result.npv < 0 ? 'bad' : 'default'} dot={result.npv >= 0} hint={`Taux d'actualisation ${(result.discountRate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`} />
        <Card title="Payback" value={fmtMonths(result.paybackMonths)} tone={result.paybackMonths === null ? 'bad' : 'default'} hint={result.paybackMonths === null ? 'Non atteint sur l’horizon' : undefined} />
        <Card title="Cash-flow cumulé" value={fmtKEur(result.totalCashFlow)} tone={result.totalCashFlow < 0 ? 'bad' : 'default'} dot={result.totalCashFlow >= 0} />
      </div>

      {/* Graphique CF annuel */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-ink">Cash-flow annuel (k€)</h2>
        <div className="mt-3"><CashFlowBars years={result.years} /></div>
      </div>

      {/* Tableau des flux */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <h2 className="px-5 pt-5 font-semibold text-ink">Flux du business case (k€)</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">Ligne</th>
                {result.years.map((y) => (<th key={y.year} className="px-3 py-3 text-right font-semibold">A{y.year}</th>))}
              </tr>
            </thead>
            <tbody>
              {FLOW_ROWS.map(({ label: rowLabel, solde, get }) => (
                <tr key={rowLabel} className={solde ? 'bg-lav' : 'border-b border-lav/60'}>
                  <td className={`sticky left-0 z-10 px-5 py-1.5 ${solde ? 'bg-lav font-semibold' : 'bg-white'}`}>{rowLabel}</td>
                  {result.years.map((y) => {
                    const v = get(y);
                    return (
                      <td key={y.year} className={`px-3 py-1.5 text-right tabular-nums ${v < 0 ? 'text-red-600' : ''} ${solde ? 'font-semibold' : ''}`}>
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

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button onClick={saveCase} disabled={busy} className={btnPrimary}>
          {busy ? 'Enregistrement...' : 'Enregistrer le business case'}
        </button>
        {saveMsg && <p className="text-sm text-ink/70">{saveMsg}</p>}
      </div>

      {/* Pré-remplissage de la navette (Head of, brouillon) */}
      {myDeptId && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-ink">Pré-remplir ma navette</h2>
            {canPrefill ? <Badge tone="peach">Brouillon v{myDraft!.version}</Badge> : <Badge tone="muted">Indisponible</Badge>}
          </div>
          {!canPrefill ? (
            <p className="mt-2 text-sm text-ink/60">
              {myDraft ? 'La dernière navette est soumise (figée) : créez une nouvelle version en brouillon pour pré-remplir.' : 'Aucune navette en brouillon à pré-remplir.'}
            </p>
          ) : payrollDefs.length === 0 && opexDefs.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">Aucune ligne salaires ni opex dans votre département : rien à pré-remplir.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink/60">
                Les salaires et les autres opex de l&apos;année 1 sont répartis en quatre trimestres égaux et ajoutés aux valeurs existantes du brouillon.
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="text-sm">
                  <span className="font-semibold text-ink">Ligne salaires cible</span>
                  <select value={effPayroll} onChange={(e) => setPayrollTarget(e.target.value)} className={`mt-1 block bg-white ${inputBase}`} disabled={payrollDefs.length === 0}>
                    {payrollDefs.length === 0 ? <option value="">Aucune ligne payroll</option> : payrollDefs.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
                  </select>
                  <span className="mt-1 block text-xs text-ink/50">Ajout : {fmtKEur(result.years[0]?.salaries ?? 0)} / an</span>
                </label>
                <label className="text-sm">
                  <span className="font-semibold text-ink">Ligne opex cible</span>
                  <select value={effOpex} onChange={(e) => setOpexTarget(e.target.value)} className={`mt-1 block bg-white ${inputBase}`} disabled={opexDefs.length === 0}>
                    {opexDefs.length === 0 ? <option value="">Aucune ligne opex</option> : opexDefs.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
                  </select>
                  <span className="mt-1 block text-xs text-ink/50">Ajout : {fmtKEur(result.years[0]?.otherOpex ?? 0)} / an</span>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button onClick={prefill} disabled={busy} className={btnSecondary}>Pré-remplir ma navette</button>
                {prefillMsg && <p className="text-sm text-ink/70">{prefillMsg}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </Page>
  );
}
