'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page, btnPrimary, btnSecondary, inputBase, usePortalData } from '@/components/shell';
import { MonthlyChart } from '@/components/monthly-chart';
import { ScenariosSection } from '@/components/scenarios-section';
import { NavetteStatusCard } from '@/components/navette-status-card';
import { CollapsiblePnlTable, type PnlTableRow } from '@/components/pnl-table';
import { InfoTip } from '@/components/info-tip';
import { AlertBanners } from '@/components/alert-banner';
import { getSupabase } from '@/lib/supabase';
import { buildConsolidationInputs, loadActuals, toChannel, toCompanyConfig, toDepartment, toDriverDef } from '@/lib/data';
import type { ActualsData, BudgetMode, SubmissionRow } from '@/lib/data';
import { consolidate, effectiveMonthlyChurn, projectBaseline, simulateRound } from '@/lib/engine';
import { MONTH_LABELS, fmtEur, fmtKEur, fmtMonths } from '@/lib/format';
import { exportConsolidation } from '@/lib/xlsx';

// Ligne de tableau mensuel : 'line' = détail, 'solde' = ligne surlignée (fond lavande),
// 'pct' = sous-ligne grise en pourcentage. Les % sont dérivés des sorties du moteur.
type RowKind = 'line' | 'solde' | 'pct';
interface PnlRow {
  label: string;
  kind: RowKind;
  fn: (m: number) => number;
  /** Ligne mise en avant (chiffre d'affaires). */
  highlight?: boolean;
}

// Carte KPI attenuee : la meme mesure, mais pour la projection SANS navettes. Plus petite,
// fond card-soft, texte estompe, avec le chip d'impact des navettes (delta avec - sans).
function MutedKpi({
  title,
  value,
  chip,
}: {
  title: string;
  value: string;
  chip: { text: string; negative: boolean };
}) {
  return (
    <div className="rounded-2xl bg-card-soft p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{title}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink/60">{value}</p>
      <span
        className={`mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ${chip.negative ? 'text-red-600' : 'text-ink/50'}`}
      >
        impact navettes : {chip.text}
      </span>
    </div>
  );
}

type KpiFormat = 'amount' | 'months' | 'cac';
interface KpiDef {
  title: string;
  format: KpiFormat;
  withRaw: number | null;
  sansRaw: number | null;
  mainValue: string;
  mainTone?: 'default' | 'bad';
  mainHint?: string;
  mainDot?: boolean;
  /** Valeur affichee sur la carte attenuee (baseline). A defaut, deduite de sansRaw. */
  mutedValue?: string;
}

/**
 * Affichage du runway NET : valeur de janvier (premier mois budgete), avec le point bas en
 * sous-libelle quand il differe. Jamais "n.a." : "Illimite" quand il n'y a aucun burn net.
 */
function netRunwayDisplay(
  months: { runwayMonths: number | null }[],
  minRunway: number | null,
  freezeThreshold: number,
): { value: string; hint?: string; bad: boolean } {
  if (minRunway === null) return { value: 'n.a.', hint: 'Free cash-flow positif sur la période', bad: false };
  let lowIdx = 0;
  let low = Infinity;
  months.forEach((m, i) => {
    if (m.runwayMonths !== null && m.runwayMonths < low) { low = m.runwayMonths; lowIdx = i; }
  });
  const jan = months[0]?.runwayMonths ?? null;
  const value = jan === null ? 'n.a.' : fmtMonths(jan);
  const differs = jan === null || Math.abs(jan - low) > 0.05;
  return {
    value,
    hint: differs ? `point bas : ${low.toFixed(1)} mois (${MONTH_LABELS[lowIdx]})` : undefined,
    bad: low < freezeThreshold,
  };
}

/** Titre de section homogène, cible des ancres de la mini-navigation. */
function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-6 text-lg font-semibold text-ink">{children}</h2>;
}

/** Petit crayon d'edition en ligne (cadrage : enveloppes, plafonds de CAC). */
function PencilButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink/40 transition-colors hover:bg-card-soft hover:text-primary"
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = usePortalData();
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cycleMsg, setCycleMsg] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [actuals, setActuals] = useState<ActualsData | null>(null);
  const [baselineKpiOpen, setBaselineKpiOpen] = useState(true);
  // Edition en ligne du cadrage depuis l'ecran Budget (enveloppe d'un departement,
  // plafond de CAC d'un canal). Une seule cellule editable a la fois.
  const [editCell, setEditCell] = useState<{ kind: 'envelope' | 'cap'; id: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [cadrageMsg, setCadrageMsg] = useState<string | null>(null);

  const result = useMemo(() => (data ? consolidate(buildConsolidationInputs(data)) : null), [data]);

  // Historique annuel : sert au scénario de reconduction (le P&L si on ne fait rien).
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    loadActuals()
      .then((a) => { if (!cancelled) setActuals(a); })
      .catch(() => { if (!cancelled) setActuals(null); });
    return () => { cancelled = true; };
  }, [data]);

  const baseline = useMemo(() => {
    if (!data || !actuals) return null;
    const prevYear = data.company.budget_year - 1;
    const pnl = actuals.pnlYears.find((y) => y.year === prevYear);
    if (!pnl) return null;
    const prevYearRevenue = Number(pnl.revenue);
    // Structure Annexe A : l'EBITDA de N-1 est le revenu moins ces quatre postes.
    const prevYearTotalCosts =
      Number(pnl.sm) + Number(pnl.tech_product) + Number(pnl.payroll_other) + Number(pnl.ga);
    // Repartition du realise N-1, pour ventiler le socle reconduit sur les memes lignes
    // que le budget (sans changer le total) : S&M, autres salaires, autres opex.
    const t = prevYearTotalCosts || 1;
    const costShares = {
      sm: Number(pnl.sm) / t,
      salaries: Number(pnl.payroll_other) / t,
      opex: (Number(pnl.tech_product) + Number(pnl.ga)) / t,
    };
    return {
      prevYear,
      prevYearRevenue,
      prevYearEbitda: prevYearRevenue - prevYearTotalCosts,
      costShares,
      res: projectBaseline({
        openingMrr: Number(data.company.opening_mrr),
        monthlyChurnPct: Number(data.company.monthly_churn_pct),
        // Si une navette fixe un objectif de churn, la baseline l'utilise aussi (repli config sinon).
        monthlyChurnRates: effectiveMonthlyChurn(buildConsolidationInputs(data)),
        grossMarginPct: Number(data.company.gross_margin_pct),
        openingCash: Number(data.company.opening_cash),
        prevYearRevenue,
        prevYearTotalCosts,
      }),
    };
  }, [data, actuals]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data || !result) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;

  // Dernière version de chaque département, quel que soit son statut (brouillon et
  // renvoyée incluses) : les cartes montrent l'état réel, pas seulement les soumises.
  const latestByDept = new Map<string, SubmissionRow>();
  for (const s of data.submissions) {
    const cur = latestByDept.get(s.department_id);
    if (!cur || s.version > cur.version) latestByDept.set(s.department_id, s);
  }
  const M = result.months;

  // Ouverture et remise a zero de la campagne budgetaire : reservees a la direction.
  const isLeader = data.profile.role === 'cfo' || data.profile.role === 'ceo';
  const hasAnyNavette = data.submissions.length > 0;
  const supabase = getSupabase();

  // Avancement de la campagne : un departement compte des qu'il a une version soumise
  // ou validee (une rejetee seule ne compte pas). Sert au commentaire dynamique de la
  // projection : combien de navettes manquent encore avant une consolidation complete.
  const consolidableDeptIds = new Set(
    data.submissions.filter((s) => s.status === 'submitted' || s.status === 'approved').map((s) => s.department_id),
  );
  const submittedCount = consolidableDeptIds.size;
  const missingCount = data.departments.length - submittedCount;

  /** Genere une navette v1 en brouillon (vide) pour chaque departement qui n'en a pas. */
  async function startExercise(mode: BudgetMode) {
    setBusy(true);
    setCycleMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const withNavette = new Set(data!.submissions.map((s) => s.department_id));
      const rows = data!.departments
        .filter((d) => !withNavette.has(d.id))
        .map((d) => ({ department_id: d.id, version: 1, status: 'draft', created_by: auth.user!.id }));
      if (rows.length > 0) {
        const { error: e } = await supabase.from('submissions').insert(rows);
        if (e) throw new Error(e.message);
      }
      const { error: eEx } = await supabase.from('budget_exercises').upsert(
        { company_id: data!.company.id, year: data!.company.budget_year, mode, started_by: auth.user!.id },
        { onConflict: 'company_id,year' },
      );
      if (eEx) throw new Error(eEx.message);
      setCycleMsg(
        mode === 'top_down'
          ? `Exercice ${data!.company.budget_year} ouvert en top-down : ${rows.length} navette(s) v1 créée(s) en brouillon, à pré-remplir par la direction.`
          : `Exercice ${data!.company.budget_year} ouvert en bottom-up : ${rows.length} navette(s) v1 créée(s) en brouillon, à remplir par chaque métier.`,
      );
      await reload();
    } catch (e) {
      setCycleMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Simule un round budgetaire complet (demonstration) : pour chaque departement, cree une
   * nouvelle version, la pre-remplit avec un budget coherent (CA +40 %, COGS 30 %, couts au
   * cadrage) puis la soumet. Le contenu vient du moteur (simulateRound), rien n'est code ici.
   */
  async function simulateRoundNow() {
    setBusy(true);
    setCycleMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const prevPnl = actuals?.pnlYears.find((y) => y.year === data!.company.budget_year - 1);
      const sim = simulateRound({
        config: toCompanyConfig(data!.company),
        departments: data!.departments.map(toDepartment),
        driverDefs: data!.driverDefs.map(toDriverDef),
        channels: data!.channels.map(toChannel),
        prevYearRevenue: prevPnl ? Number(prevPnl.revenue) : null,
        cacAvgTarget: data!.company.cac_avg_target,
      });
      // Version suivante par departement : on incremente la plus haute existante.
      const maxVer = new Map<string, number>();
      for (const s of data!.submissions) {
        maxVer.set(s.department_id, Math.max(maxVer.get(s.department_id) ?? 0, s.version));
      }
      let count = 0;
      for (const dept of sim.departments) {
        const version = (maxVer.get(dept.departmentId) ?? 0) + 1;
        const { data: created, error: eSub } = await supabase
          .from('submissions')
          .insert({ department_id: dept.departmentId, version, status: 'draft', created_by: auth.user!.id })
          .select()
          .single();
        if (eSub) throw new Error(eSub.message);
        const subId = (created as SubmissionRow).id;
        if (dept.driverLines.length > 0) {
          const { error: e } = await supabase.from('submission_lines').insert(
            dept.driverLines.map((l) => ({
              submission_id: subId,
              driver_def_id: l.driverDefId,
              q1: l.q[0], q2: l.q[1], q3: l.q[2], q4: l.q[3],
              unit_cost: l.unitCost ?? null,
            })),
          );
          if (e) throw new Error(e.message);
        }
        if (dept.customLines.length > 0) {
          const { error: e } = await supabase.from('submission_custom_lines').insert(
            dept.customLines.map((c, i) => ({
              submission_id: subId,
              kind: c.kind,
              label: c.label,
              is_new: c.isNew,
              vendor: null,
              frequency: c.frequency,
              amount: null,
              oneshot_quarter: null,
              sort: i,
              q1: c.q[0], q2: c.q[1], q3: c.q[2], q4: c.q[3],
            })),
          );
          if (e) throw new Error(e.message);
        }
        const { error: eUp } = await supabase
          .from('submissions')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .eq('id', subId);
        if (eUp) throw new Error(eUp.message);
        count++;
      }
      setCycleMsg(
        `Round simulé : ${count} navette(s) pré-remplie(s) et soumise(s), revenu cible ${fmtKEur(sim.targetRevenue)} (reconduction +40 %). La consolidation est à jour.`,
      );
      await reload();
    } catch (e) {
      setCycleMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /** Supprime TOUTES les navettes de la societe (les lignes suivent par cascade). */
  async function resetExercise() {
    setBusy(true);
    setCycleMsg(null);
    try {
      const deptIds = data!.departments.map((d) => d.id);
      const { error: e } = await supabase.from('submissions').delete().in('department_id', deptIds);
      if (e) throw new Error(e.message);
      const { error: eEx } = await supabase
        .from('budget_exercises')
        .delete()
        .eq('company_id', data!.company.id)
        .eq('year', data!.company.budget_year);
      if (eEx) throw new Error(eEx.message);
      setCycleMsg('Exercice remis à zéro : toutes les navettes ont été supprimées.');
      setResetArmed(false);
      await reload();
    } catch (e) {
      setCycleMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const canEditCadrage = isLeader;

  /** Ouvre l'edition d'une cellule de cadrage. L'enveloppe se saisit en k€, le plafond en €. */
  function startEditCadrage(kind: 'envelope' | 'cap', id: string, current: number | null) {
    setCadrageMsg(null);
    setEditValue(current === null ? '' : String(kind === 'envelope' ? Math.round(current / 1000) : current));
    setEditCell({ kind, id });
  }

  /** Enregistre l'enveloppe (departements) ou le plafond de CAC (canaux). Vide = aucune limite. */
  async function saveCadrage() {
    if (!editCell) return;
    const raw = editValue.trim().replace(',', '.');
    let value: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setCadrageMsg('Valeur invalide : un nombre positif, ou vide pour aucune limite.');
        return;
      }
      value = editCell.kind === 'envelope' ? Math.round(n * 1000) : n;
    }
    setBusy(true);
    setCadrageMsg(null);
    try {
      const { error: e } =
        editCell.kind === 'envelope'
          ? await supabase.from('departments').update({ envelope: value }).eq('id', editCell.id)
          : await supabase.from('channels').update({ cac_cap: value }).eq('id', editCell.id);
      if (e) throw new Error(e.message);
      setEditCell(null);
      await reload();
    } catch (e) {
      setCadrageMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Champ d'edition en ligne : Entree enregistre, Echap annule, clic ailleurs annule.
  const cadrageInput = (suffix: string) => (
    <span className="inline-flex items-center justify-end gap-1">
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={editValue}
        disabled={busy}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void saveCadrage(); }
          else if (e.key === 'Escape') { setEditCell(null); setCadrageMsg(null); }
        }}
        onBlur={() => { if (!busy) setEditCell(null); }}
        className={`w-20 text-right ${inputBase} bg-white`}
      />
      <span className="text-xs text-ink/40">{suffix}</span>
    </span>
  );

  // Tableau P&L (avec navettes) : détails, soldes surlignés et sous-lignes de ratio en %.
  const pnlRows: PnlRow[] = [
    { label: 'MRR fin de mois', kind: 'line', fn: (m) => M[m].mrrEnd },
    { label: 'Revenus non récurrents', kind: 'line', fn: (m) => M[m].otherRevenue },
    { label: 'Chiffre d’affaires', kind: 'line', highlight: true, fn: (m) => M[m].revenue },
    { label: 'COGS', kind: 'line', fn: (m) => -M[m].cogsTotal },
    { label: 'Marge brute', kind: 'solde', fn: (m) => M[m].grossMargin },
    { label: 'Marge brute (%)', kind: 'pct', fn: (m) => (M[m].revenue ? (M[m].revenue - M[m].cogsTotal) / M[m].revenue : NaN) },
    { label: 'Coûts S&M', kind: 'line', fn: (m) => -M[m].smSpend },
    { label: 'Marge de contribution', kind: 'solde', fn: (m) => M[m].contributionMargin },
    { label: 'Marge de contribution (%)', kind: 'pct', fn: (m) => (M[m].contributionMarginPct ?? NaN) },
    { label: 'Autres salaires', kind: 'line', fn: (m) => -M[m].payrollTotal },
    { label: 'Autres opex', kind: 'line', fn: (m) => -M[m].opexTotal },
    { label: 'EBITDA', kind: 'solde', fn: (m) => M[m].ebitda },
    { label: 'Marge sur EBITDA (%)', kind: 'pct', fn: (m) => (M[m].revenue ? M[m].ebitda / M[m].revenue : NaN) },
    { label: 'Capex', kind: 'line', fn: (m) => -M[m].capexTotal },
  ];

  // Convention "Total année", strictement alignée sur l'export xlsx : les flux somment
  // les douze mois, les stocks (MRR, Trésorerie) prennent décembre, les ratios prennent
  // décembre (marge) ou la valeur d'année (runway, géré à part avec minRunway).
  const rangeMonths = (fn: (m: number) => number): number[] => Array.from({ length: 12 }, (_, m) => fn(m));
  const sum12 = (fn: (m: number) => number): number => rangeMonths(fn).reduce((a, b) => a + b, 0);
  const isStockLabel = (label: string) => label.startsWith('MRR') || label.startsWith('Trésorerie');

  const withPnlRows: PnlTableRow[] = result.ok
    ? pnlRows.map((r) => {
        const months = rangeMonths(r.fn);
        const annual = r.kind === 'pct' ? r.fn(11) : isStockLabel(r.label) ? months[11] : months.reduce((a, b) => a + b, 0);
        return {
          label: r.label,
          format: r.kind === 'pct' ? 'pct' : 'amount',
          strong: r.kind === 'solde',
          muted: r.kind === 'pct',
          highlight: r.highlight,
          months,
          annual,
        };
      })
    : [];

  // Point bas du runway brut (mois) sur la periode, pour la colonne Solde.
  const minGross = (ms: { grossRunwayMonths: number | null }[]): number | null => {
    const vals = ms.map((r) => r.grossRunwayMonths).filter((v): v is number => v !== null);
    return vals.length ? Math.min(...vals) : null;
  };

  const withCashRows: PnlTableRow[] = result.ok
    ? [
        { label: 'Solde de trésorerie fin de période (k€)', format: 'amount', strong: true, months: M.map((r) => r.cash), annual: M[11].cash },
        { label: 'Runway net (mois)', format: 'months', muted: true, months: M.map((r) => r.runwayMonths), annual: result.totals!.minRunway },
        { label: 'Runway brut (mois)', format: 'months', muted: true, months: M.map((r) => r.grossRunwayMonths), annual: minGross(M) },
      ]
    : [];

  // Projection sans navettes (baseline) : reconduction définie dans engine/baseline.ts.
  // Mêmes lignes EXACTEMENT que le P&L avec navettes. Le socle fixe reconduit est ventilé
  // sur Coûts S&M / Autres salaires / Autres opex selon la répartition du réalisé N-1,
  // sans changer le total (donc EBITDA et trésorerie inchangés). COGS = revenu - marge brute.
  const bm = baseline?.res.months ?? [];
  const shares = baseline?.costShares ?? { sm: 0, salaries: 0, opex: 0 };
  const bmSm = (i: number) => bm[i].fixedCosts * shares.sm;
  const bmSal = (i: number) => bm[i].fixedCosts * shares.salaries;
  const bmOpex = (i: number) => bm[i].fixedCosts * shares.opex;
  const bmCogs = (i: number) => bm[i].revenue - bm[i].grossMargin;
  const bmContrib = (i: number) => bm[i].grossMargin - bmSm(i);
  const pctAnnual = (fn: (i: number) => number) => (bm[11]?.revenue ? fn(11) / bm[11].revenue : null);
  const baselinePnlRows: PnlTableRow[] = baseline
    ? [
        { label: 'MRR fin de mois', format: 'amount', months: rangeMonths((i) => bm[i].mrrEnd), annual: bm[11].mrrEnd },
        { label: 'Revenus non récurrents', format: 'amount', months: rangeMonths(() => 0), annual: 0 },
        { label: 'Chiffre d’affaires', format: 'amount', highlight: true, months: rangeMonths((i) => bm[i].revenue), annual: sum12((i) => bm[i].revenue) },
        { label: 'COGS', format: 'amount', months: rangeMonths((i) => -bmCogs(i)), annual: -sum12(bmCogs) },
        { label: 'Marge brute', format: 'amount', strong: true, months: rangeMonths((i) => bm[i].grossMargin), annual: sum12((i) => bm[i].grossMargin) },
        { label: 'Marge brute (%)', format: 'pct', muted: true, months: rangeMonths((i) => (bm[i].revenue ? bm[i].grossMargin / bm[i].revenue : NaN)), annual: pctAnnual((i) => bm[i].grossMargin) },
        { label: 'Coûts S&M', format: 'amount', months: rangeMonths((i) => -bmSm(i)), annual: -sum12(bmSm) },
        { label: 'Marge de contribution', format: 'amount', strong: true, months: rangeMonths(bmContrib), annual: sum12(bmContrib) },
        { label: 'Marge de contribution (%)', format: 'pct', muted: true, months: rangeMonths((i) => (bm[i].revenue ? bmContrib(i) / bm[i].revenue : NaN)), annual: pctAnnual(bmContrib) },
        { label: 'Autres salaires', format: 'amount', months: rangeMonths((i) => -bmSal(i)), annual: -sum12(bmSal) },
        { label: 'Autres opex', format: 'amount', months: rangeMonths((i) => -bmOpex(i)), annual: -sum12(bmOpex) },
        { label: 'EBITDA', format: 'amount', strong: true, months: rangeMonths((i) => bm[i].ebitda), annual: sum12((i) => bm[i].ebitda) },
        { label: 'Marge sur EBITDA (%)', format: 'pct', muted: true, months: rangeMonths((i) => (bm[i].revenue ? bm[i].ebitda / bm[i].revenue : NaN)), annual: pctAnnual((i) => bm[i].ebitda) },
        { label: 'Capex', format: 'amount', months: rangeMonths(() => 0), annual: 0 },
      ]
    : [];
  const baselineCashRows: PnlTableRow[] = baseline
    ? [
        { label: 'Solde de trésorerie fin de période (k€)', format: 'amount', strong: true, months: bm.map((x) => x.cash), annual: bm[11].cash },
        { label: 'Runway net (mois)', format: 'months', muted: true, months: bm.map((x) => x.runwayMonths), annual: baseline.res.totals.minRunway },
        { label: 'Runway brut (mois)', format: 'months', muted: true, months: bm.map((x) => x.grossRunwayMonths), annual: minGross(bm) },
      ]
    : [];

  // Six KPIs comparables (avec navettes / sans navettes). La projection sans navettes n'a
  // pas de CAC (aucun canal modélisé) : sa carte et son chip d'impact restent en n.a.
  const freezeMonths = Number(data.company.runway_freeze_months);
  const withNet = result.ok ? netRunwayDisplay(M, result.totals!.minRunway, freezeMonths) : null;
  const sansNet = baseline ? netRunwayDisplay(baseline.res.months, baseline.res.totals.minRunway, freezeMonths) : null;
  const kpiDefs: KpiDef[] = result.ok
    ? [
        { title: "MRR fin d'année", format: 'amount', withRaw: result.totals!.mrrEnd, sansRaw: baseline?.res.totals.mrrEnd ?? null, mainValue: fmtKEur(result.totals!.mrrEnd) },
        {
          title: 'EBITDA annuel',
          format: 'amount',
          withRaw: result.totals!.ebitda,
          sansRaw: baseline?.res.totals.ebitda ?? null,
          mainValue: `${result.totals!.ebitda >= 0 ? '+' : ''}${fmtKEur(result.totals!.ebitda)}`,
          mainTone: result.totals!.ebitda < 0 ? 'bad' : 'default',
          mainDot: result.totals!.ebitda >= 0,
        },
        { title: "Trésorerie fin d'année", format: 'amount', withRaw: result.totals!.endCash, sansRaw: baseline?.res.totals.endCash ?? null, mainValue: fmtKEur(result.totals!.endCash), mainTone: result.totals!.endCash < 0 ? 'bad' : 'default' },
        {
          // Runway NET (convention inchangee), valeur de janvier + point bas ; jamais n.a.
          title: 'Runway',
          format: 'months',
          withRaw: result.totals!.minRunway,
          sansRaw: baseline?.res.totals.minRunway ?? null,
          mainValue: withNet!.value,
          mainHint: withNet!.hint,
          mainTone: withNet!.bad ? 'bad' : 'default',
          mutedValue: sansNet?.value,
        },
        {
          // Runway BRUT : stress test a zero encaissement, valeur de janvier.
          title: 'Runway brut',
          format: 'months',
          withRaw: M[0].grossRunwayMonths,
          sansRaw: baseline?.res.months[0].grossRunwayMonths ?? null,
          mainValue: fmtMonths(M[0].grossRunwayMonths),
          mainHint: 'hypothèse zéro encaissement',
          mutedValue: baseline ? fmtMonths(baseline.res.months[0].grossRunwayMonths) : undefined,
        },
        { title: 'CAC moyen', format: 'cac', withRaw: result.totals!.blendedCac, sansRaw: null, mainValue: result.totals!.blendedCac !== null ? fmtEur(result.totals!.blendedCac) : 'n.a.', mainHint: result.totals!.grossPaybackMonths !== null ? `Payback brut ${result.totals!.grossPaybackMonths.toFixed(1)} mois` : undefined },
      ]
    : [];

  const kpiMutedValue = (d: KpiDef): string =>
    d.mutedValue !== undefined
      ? d.mutedValue
      : d.format === 'cac' || d.sansRaw === null
        ? 'n.a.'
        : d.format === 'months'
          ? fmtMonths(d.sansRaw)
          : fmtKEur(d.sansRaw);
  const kpiChip = (d: KpiDef): { text: string; negative: boolean } => {
    if (d.format === 'cac' || d.sansRaw === null || d.withRaw === null) return { text: 'n.a.', negative: false };
    const delta = d.withRaw - d.sansRaw;
    if (d.format === 'months') {
      return { text: `${delta >= 0 ? '+' : ''}${delta.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`, negative: delta < 0 };
    }
    return { text: `${delta >= 0 ? '+' : ''}${fmtKEur(delta)}`, negative: delta < 0 };
  };

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

  // Mini-navigation d'ancres : uniquement les sections réellement rendues.
  const okNav: [string, string][] = [
    ['navettes', 'Navettes'],
    ['kpis', 'Indicateurs'],
    ['alertes', 'Alertes'],
    ['pnl', 'P&L'],
    ['tresorerie', 'Trésorerie'],
    ['graphique', 'Graphique'],
    ['contribution', 'Départements'],
  ];
  if (channelOrder.length > 0) okNav.push(['cac', 'CAC']);
  okNav.push(['scenarios', 'Scénarios']);
  const navItems: [string, string][] = result.ok
    ? okNav
    : [['navettes', 'Navettes'], ...(baseline ? ([['kpis', 'Indicateurs'], ['pnl', 'P&L'], ['tresorerie', 'Trésorerie']] as [string, string][]) : [])];

  const baselineTooltip = baseline
    ? `Projection sans navettes : reconduction du budget ${baseline.prevYear}. Le MRR de fin ${baseline.prevYear} s’érode du churn, la marge brute reste au taux de cadrage, et le socle de coûts fixes de ${baseline.prevYear} est reconduit puis ventilé sur les mêmes lignes que le budget (Coûts S&M, Autres salaires, Autres opex) selon la répartition du réalisé ${baseline.prevYear}, sans changer le total.`
    : '';

  return (
    <Page data={data}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Budget {data.company.budget_year}</h1>
          <p className="mt-1 text-sm text-ink/60">
            Recalculée en direct à partir des dernières navettes soumises.
          </p>
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50">
            {navItems.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="transition-colors hover:text-ink">{label}</a>
            ))}
          </nav>
        </div>
        {result.ok && (
          <button
            onClick={async () => {
              try {
                await exportConsolidation(result, data.company.name, data.company.budget_year, buildConsolidationInputs(data));
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

      {/* Campagne budgétaire : ouverture, remise à zéro et simulation, réservées à la direction */}
      {isLeader && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-ink">Campagne budgétaire {data.company.budget_year}</h2>
            {data.exercise ? (
              <Badge tone="accent" dot="mint">
                {data.exercise.mode === 'top_down' ? 'Top-down' : 'Bottom-up'}
              </Badge>
            ) : (
              <Badge tone="lav">Non ouverte</Badge>
            )}
          </div>

          {!hasAnyNavette ? (
            <>
              <p className="mt-2 text-sm text-ink/60">
                Aucune navette n&apos;existe. Ouvrez la campagne : une navette v1 en brouillon, vide, est créée pour chaque département.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => startExercise('top_down')} disabled={busy} className={btnPrimary}>
                  Démarrer en top-down
                </button>
                <button onClick={() => startExercise('bottom_up')} disabled={busy} className={btnSecondary}>
                  Démarrer en bottom-up
                </button>
              </div>
              <p className="mt-2 text-xs text-ink/50">
                Top-down : la direction pré-remplit les navettes, le métier ajuste ensuite. Bottom-up : chaque métier remplit la sienne.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink/60">
                {data.submissions.length} {data.submissions.length > 1 ? 'navettes' : 'navette'} en circulation. La consolidation ne produit aucun chiffre tant qu&apos;un département n&apos;a pas soumis la sienne.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {resetArmed ? (
                  <>
                    <span className="text-sm font-semibold text-red-700">
                      Supprimer les {data.submissions.length} navettes de {data.company.name} ? Cette action est irréversible.
                    </span>
                    <button onClick={resetExercise} disabled={busy} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100">
                      Oui, tout supprimer
                    </button>
                    <button onClick={() => setResetArmed(false)} disabled={busy} className={btnSecondary}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button onClick={() => setResetArmed(true)} disabled={busy} className={btnSecondary}>
                    Réinitialiser l&apos;exercice
                  </button>
                )}
              </div>
            </>
          )}

          {/* Demonstration : remplir et soumettre un round complet en un clic */}
          <div className="mt-4 border-t border-lav/60 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Démonstration</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={simulateRoundNow} disabled={busy} className={btnSecondary}>
                Simuler un round budgétaire
              </button>
              <span className="text-xs text-ink/50">
                Pré-remplit toutes les navettes avec un budget cohérent (CA +40 %, COGS 30 %, coûts au cadrage), les soumet et incrémente la version.
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => document.getElementById('scenarios')?.scrollIntoView({ behavior: 'smooth' })}
                className={btnSecondary}
              >
                Simuler les scénarios as is / rebound
              </button>
              <span className="text-xs text-ink/50">
                Descend jusqu&apos;à la section Scénarios : la projection pluriannuelle « as is » et « rebound » à partir du dernier P&amp;L réalisé.
              </span>
            </div>
          </div>

          {cycleMsg && <p className="mt-3 text-sm text-ink/70">{cycleMsg}</p>}
        </div>
      )}

      {/* 1. Navettes reçues : une carte par département */}
      <section className="mt-8">
        <SectionTitle id="navettes">Navettes reçues</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.departments.map((d) => (
            <NavetteStatusCard key={d.id} code={d.code} name={d.name} submission={latestByDept.get(d.id) ?? null} />
          ))}
        </div>
      </section>

      {!result.ok ? (
        <>
          {/* Contrôles bloquants : le moteur refuse de consolider */}
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="font-semibold text-red-700">
              Consolidation refusée : {result.blocking.length} contrôle(s) bloquant(s)
            </h2>
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

          {/* Tant que la consolidation est bloquée, seule la projection sans navettes est disponible */}
          {baseline && (
            <>
              {missingCount > 0 && (
                <div className="mt-6 rounded-xl bg-peach px-4 py-3 text-sm text-ink">
                  {submittedCount === 0
                    ? `Aucune navette soumise : voici le budget reconduit, tel qu'il serait sans aucune action (${missingCount} navette${missingCount > 1 ? 's' : ''} attendue${missingCount > 1 ? 's' : ''}).`
                    : `${submittedCount} navette${submittedCount > 1 ? 's' : ''} soumise${submittedCount > 1 ? 's' : ''} sur ${data.departments.length}, ${missingCount} en attente. Tant que la consolidation n'est pas complète, seule cette projection à budget inchangé est disponible.`}
                </div>
              )}

              <section className="mt-8">
                <SectionTitle id="kpis">Indicateurs clés, projection sans navettes</SectionTitle>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Card title="MRR fin d'année" value={fmtKEur(baseline.res.totals.mrrEnd)} tone="bad" hint="Érodé par le churn" />
                  <Card
                    title="EBITDA"
                    value={fmtKEur(baseline.res.totals.ebitda)}
                    tone={baseline.res.totals.ebitda < 0 ? 'bad' : 'default'}
                    hint={`${baseline.prevYear} réalisé : ${fmtKEur(baseline.prevYearEbitda)}`}
                  />
                  <Card title="Trésorerie fin d'année" value={fmtKEur(baseline.res.totals.endCash)} tone={baseline.res.totals.endCash < 0 ? 'bad' : 'default'} />
                  <Card title="Runway" value={sansNet!.value} hint={sansNet!.hint} tone={sansNet!.bad ? 'bad' : 'default'} />
                  <Card title="Runway brut" value={fmtMonths(baseline.res.months[0].grossRunwayMonths)} hint="hypothèse zéro encaissement" />
                  <Card title="Revenu" value={fmtKEur(baseline.res.totals.revenue)} />
                </div>
              </section>

              <section className="mt-8">
                <SectionTitle id="pnl">P&amp;L {data.company.budget_year}</SectionTitle>
                <div className="mt-4">
                  <CollapsiblePnlTable title="P&L projeté sans navettes (k€)" rows={baselinePnlRows} defaultOpen info={baselineTooltip} />
                </div>
              </section>

              <section className="mt-8">
                <SectionTitle id="tresorerie">Trésorerie et runway</SectionTitle>
                <div className="mt-4">
                  <CollapsiblePnlTable title="Trésorerie et runway sans navettes" rows={baselineCashRows} firstColLabel="Ligne" totalLabel="Solde" defaultOpen info={baselineTooltip} />
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          {/* 2. Indicateurs clés : avec navettes, puis projection sans navettes atténuée */}
          <section className="mt-8">
            <SectionTitle id="kpis">Indicateurs clés</SectionTitle>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {kpiDefs.map((d) => (
                <Card key={d.title} title={d.title} value={d.mainValue} tone={d.mainTone} hint={d.mainHint} dot={d.mainDot} />
              ))}
            </div>
            {baseline && (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBaselineKpiOpen((o) => !o)}
                    aria-expanded={baselineKpiOpen}
                    className="flex items-center gap-2"
                  >
                    <span className={`inline-block text-primary transition-transform ${baselineKpiOpen ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
                    <span className="rounded-full bg-lav px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink">Baseline</span>
                  </button>
                  <InfoTip text={baselineTooltip} />
                </div>
                {baselineKpiOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {kpiDefs.map((d) => (
                      <MutedKpi key={d.title} title={d.title} value={kpiMutedValue(d)} chip={kpiChip(d)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. Alertes de gestion */}
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <SectionTitle id="alertes">Alertes de gestion</SectionTitle>
              <span className="rounded-full bg-lav px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">{result.warnings.length}</span>
            </div>
            <AlertBanners
              alerts={result.warnings}
              emptyMessage="Aucune alerte : le budget respecte le cadrage."
              periodFor={(a) => (a.quarter ? `T${a.quarter}` : a.month ? MONTH_LABELS[a.month - 1] : undefined)}
            />
          </section>

          {/* 4. P&L 2027 : avec navettes (déplié) et sans navettes (replié), comparables */}
          <section className="mt-8">
            <SectionTitle id="pnl">P&amp;L {data.company.budget_year}</SectionTitle>
            <div className="mt-4 space-y-4">
              <CollapsiblePnlTable title="P&L projeté avec navettes (k€)" rows={withPnlRows} defaultOpen />
              {baseline && <CollapsiblePnlTable title="P&L projeté sans navettes (k€)" rows={baselinePnlRows} info={baselineTooltip} />}
            </div>
          </section>

          {/* 5. Trésorerie et runway : avec navettes (déplié) et sans navettes (replié) */}
          <section className="mt-8">
            <SectionTitle id="tresorerie">Trésorerie et runway</SectionTitle>
            <div className="mt-4 space-y-4">
              <CollapsiblePnlTable title="Trésorerie et runway avec navettes" rows={withCashRows} firstColLabel="Ligne" totalLabel="Solde" defaultOpen />
              {baseline && <CollapsiblePnlTable title="Trésorerie et runway sans navettes" rows={baselineCashRows} firstColLabel="Ligne" totalLabel="Solde" info={baselineTooltip} />}
            </div>
          </section>

          {/* 6. Graphique EBITDA et trésorerie */}
          <section className="mt-8">
            <SectionTitle id="graphique">EBITDA et trésorerie {data.company.budget_year}</SectionTitle>
            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
              <MonthlyChart months={result.months} />
            </div>
          </section>

          {/* 7. Contribution par département */}
          <section className="mt-8">
            <SectionTitle id="contribution">Contribution par département</SectionTitle>
            <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                      <th className="px-5 py-3 font-semibold">Département</th>
                      <th className="px-5 py-3 text-right font-semibold">Coût annuel</th>
                      <th className="px-5 py-3 text-right font-semibold">Enveloppe</th>
                      <th className="px-5 py-3 text-right font-semibold">Écart vs enveloppe</th>
                      <th className="px-5 py-3 text-right font-semibold">
                        New MRR annuel
                        <span className="block text-[10px] font-normal normal-case tracking-normal text-ink/40">cumul des ajouts mensuels, expansion incluse</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.departments.map((d) => (
                      <tr key={d.departmentId} className="border-b border-lav/60 last:border-0">
                        <td className="px-5 py-2.5 font-semibold text-ink">{d.name}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{fmtKEur(d.annualCost)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          {editCell?.kind === 'envelope' && editCell.id === d.departmentId ? (
                            cadrageInput('k€')
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1">
                              {d.envelope !== null ? fmtKEur(d.envelope) : '-'}
                              {canEditCadrage && <PencilButton label="Modifier l’enveloppe" onClick={() => startEditCadrage('envelope', d.departmentId, d.envelope)} />}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {d.envelope === null ? (
                            <span className="text-ink/40">-</span>
                          ) : d.annualCost - d.envelope > 0 ? (
                            // Depassement : ecart positif, rouge sobre et gras.
                            <span className="font-semibold tabular-nums text-red-600">+{fmtKEur(d.annualCost - d.envelope)}</span>
                          ) : (
                            // Sous l'enveloppe : ecart negatif, en ink discret (le vert n'existe pas en texte).
                            <span className="tabular-nums text-ink/60">{fmtKEur(d.annualCost - d.envelope)}</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{d.annualMrrAdded > 0 ? fmtKEur(d.annualMrrAdded) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {canEditCadrage && (
              <p className="mt-2 text-xs text-ink/50">Enveloppe modifiable en ligne (crayon) : les alertes se recalculent aussitôt.</p>
            )}
            {cadrageMsg && editCell?.kind === 'envelope' && <p className="mt-2 text-sm text-red-600">{cadrageMsg}</p>}
          </section>

          {/* 8. CAC par canal et par trimestre */}
          {channelOrder.length > 0 && (
            <section className="mt-8">
              <SectionTitle id="cac">CAC par canal et par trimestre</SectionTitle>
              <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                          <td className="px-5 py-2 text-right tabular-nums text-ink/60">
                            {editCell?.kind === 'cap' && editCell.id === ch.id ? (
                              cadrageInput('€')
                            ) : (
                              <span className="inline-flex items-center justify-end gap-1">
                                {ch.cap === null ? '-' : fmtEur(ch.cap)}
                                {canEditCadrage && <PencilButton label="Modifier le plafond" onClick={() => startEditCadrage('cap', ch.id, ch.cap)} />}
                              </span>
                            )}
                          </td>
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
              {canEditCadrage && (
                <p className="mt-2 text-xs text-ink/50">Plafond de CAC modifiable en ligne (crayon) : les alertes se recalculent aussitôt.</p>
              )}
              {cadrageMsg && editCell?.kind === 'cap' && <p className="mt-2 text-sm text-red-600">{cadrageMsg}</p>}
            </section>
          )}

          {/* 9. Scénarios pluriannuels : lecture prospective du budget (as is / rebound) */}
          <section className="mt-8">
            <SectionTitle id="scenarios">Scénarios pluriannuels</SectionTitle>
            <p className="mt-1 text-sm text-ink/60">
              Projection N+1 à N+3 à partir du P&amp;L de l&apos;année N ; hypothèses modifiables.
            </p>
            <ScenariosSection pnlYears={actuals?.pnlYears ?? null} budgetYear={data.company.budget_year} />
          </section>
        </>
      )}
    </Page>
  );
}
