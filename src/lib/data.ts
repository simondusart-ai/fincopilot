import { getSupabase } from './supabase';
import { applyBusinessCases } from './engine';
import type {
  AcceptedBusinessCase,
  BusinessCaseInput,
  Channel,
  CompanyConfig,
  ConsolidationInputs,
  Department,
  DriverDef,
  DriverKind,
  LineFrequency,
  QuarterValues,
  Submission,
  SubmissionLine,
} from './engine';

/** Lignes brutes des tables Supabase (montants en euros, fractions pour les %). */
export interface CompanyRow {
  id: string;
  name: string;
  budget_year: number;
  opening_cash: number;
  opening_mrr: number;
  arpa: number;
  gross_margin_pct: number;
  monthly_churn_pct: number;
  runway_vigilance_months: number;
  runway_freeze_months: number;
  payback_cap_months: number | null;
  seasonal_keys: Record<string, number[]>;
  opening_clients: number;
  cac_avg_target: number | null;
}

export interface DepartmentRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  envelope: number | null;
  is_sales_marketing: boolean;
  sort: number;
}

export interface ChannelRow {
  id: string;
  company_id: string;
  name: string;
  cac_cap: number | null;
}

export interface DriverDefRow {
  id: string;
  department_id: string;
  code: string;
  label: string;
  kind: DriverKind;
  channel_id: string | null;
  monthly_key: string | null;
  sort: number;
  /** Réalisé du trimestre précédent. Non alimenté pour l'instant (voir Limites). */
  prev_q4: number | null;
}

export interface ProfileRow {
  user_id: string;
  company_id: string;
  department_id: string | null;
  role: 'cfo' | 'head_of' | 'ceo';
  full_name: string;
}

export interface BusinessCaseRow {
  id: string;
  company_id: string;
  department_id: string | null;
  target_department_id: string | null;
  /** Département qui porte les COGS du projet. null = le département cible. */
  cogs_department_id: string | null;
  label: string;
  params: BusinessCaseInput;
  status: 'proposed' | 'accepted' | 'rejected';
  created_by: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type SubmissionStatusRow = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface SubmissionRow {
  id: string;
  department_id: string;
  version: number;
  status: SubmissionStatusRow;
  created_by: string;
  submitted_at: string | null;
  created_at: string;
  /** Decision du CFO ou du CEO sur une navette soumise. */
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/** Statuts qui font foi pour la consolidation : soumise, ou validee (une rejetee est ignoree). */
export const CONSOLIDATED_STATUSES: readonly SubmissionStatusRow[] = ['submitted', 'approved'];

export interface SubmissionLineRow {
  id: string;
  submission_id: string;
  driver_def_id: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  unit_cost: number | null;
}

/** Ligne libre saisie par le métier (table submission_custom_lines). */
export interface SubmissionCustomLineRow {
  id: string;
  submission_id: string;
  kind: DriverKind;
  label: string;
  is_new: boolean;
  vendor: string | null;
  frequency: LineFrequency;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  /** Montant unitaire : quand il est renseigné, les trimestres en découlent. */
  amount: number | null;
  /** Trimestre porteur d'un décaissement one_shot (1 à 4). */
  oneshot_quarter: number | null;
  /** Ordre d'affichage : une ligne ajoutée se place à la suite, jamais au milieu. */
  sort: number;
  /** Réalisé du trimestre précédent. Non alimenté pour l'instant. */
  prev_q4: number | null;
}

export interface PortalData {
  profile: ProfileRow;
  company: CompanyRow;
  departments: DepartmentRow[];
  channels: ChannelRow[];
  driverDefs: DriverDefRow[];
  submissions: SubmissionRow[];
  lines: SubmissionLineRow[];
  customLines: SubmissionCustomLineRow[];
  businessCases: BusinessCaseRow[];
  /** Exercice budgétaire ouvert pour l'année budgétée. null = campagne pas encore lancée. */
  exercise: BudgetExerciseRow | null;
}

/** Lignes brutes de l'historique realise (migration 0003). Montants en euros. */
export interface PnlYearRow {
  id: string;
  company_id: string;
  year: number;
  revenue: number;
  sm: number;
  tech_product: number;
  payroll_other: number;
  ga: number;
  ebitda: number;
  da: number;
  net_income: number;
}

export interface MonthlyActualRow {
  id: string;
  company_id: string;
  year: number;
  month: number;
  new_clients: number;
  churned_clients: number;
  mrr_end: number;
  revenue_month: number | null;
  sm_spend: number;
  cash_end: number | null;
  nrr_measured: number | null;
}

export interface ChannelActualRow {
  id: string;
  company_id: string;
  channel_id: string;
  year: number;
  month: number;
  spend: number;
  new_customers: number;
}

/** Exercice budgetaire ouvert par la direction (table budget_exercises). */
export type BudgetMode = 'top_down' | 'bottom_up';

export interface BudgetExerciseRow {
  id: string;
  company_id: string;
  year: number;
  mode: BudgetMode;
  started_by: string;
  started_at: string;
}

export interface ActualsData {
  pnlYears: PnlYearRow[];
  monthlyActuals: MonthlyActualRow[];
  channelActuals: ChannelActualRow[];
}

/** Charge l'historique realise autorise par la RLS pour la societe de l'utilisateur. */
export async function loadActuals(): Promise<ActualsData> {
  const supabase = getSupabase();
  const [pnl, monthly, channel] = await Promise.all([
    supabase.from('pnl_years').select('*').order('year'),
    supabase.from('monthly_actuals').select('*').order('month'),
    supabase.from('channel_actuals').select('*'),
  ]);
  const firstError = pnl.error ?? monthly.error ?? channel.error;
  if (firstError) throw new Error(`Erreur de chargement du pilotage : ${firstError.message}`);
  return {
    pnlYears: (pnl.data ?? []) as PnlYearRow[],
    monthlyActuals: (monthly.data ?? []) as MonthlyActualRow[],
    channelActuals: (channel.data ?? []) as ChannelActualRow[],
  };
}

/** Charge tout ce que la RLS autorise pour l'utilisateur courant. */
export async function loadPortalData(): Promise<PortalData> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Non connecté.');

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', auth.user.id)
    .single();
  if (pErr || !profile) throw new Error('Profil introuvable : contactez le CFO.');

  const [companies, departments, channels, driverDefs, submissions, lines, customLines, businessCases, exercises] = await Promise.all([
    supabase.from('companies').select('*').eq('id', profile.company_id).single(),
    supabase.from('departments').select('*').order('sort'),
    supabase.from('channels').select('*').order('name'),
    supabase.from('driver_defs').select('*').order('sort'),
    supabase.from('submissions').select('*').order('version'),
    supabase.from('submission_lines').select('*'),
    supabase.from('submission_custom_lines').select('*').order('sort').order('label'),
    supabase.from('business_cases').select('*').order('created_at'),
    supabase.from('budget_exercises').select('*'),
  ]);
  const firstError =
    companies.error ?? departments.error ?? channels.error ?? driverDefs.error ??
    submissions.error ?? lines.error ?? customLines.error ?? businessCases.error ?? exercises.error;
  if (firstError) throw new Error(`Erreur de chargement : ${firstError.message}`);

  const company = companies.data as CompanyRow;
  const exercise =
    ((exercises.data ?? []) as BudgetExerciseRow[]).find((e) => e.year === company.budget_year) ?? null;

  return {
    profile: profile as ProfileRow,
    company,
    departments: (departments.data ?? []) as DepartmentRow[],
    channels: (channels.data ?? []) as ChannelRow[],
    driverDefs: (driverDefs.data ?? []) as DriverDefRow[],
    submissions: (submissions.data ?? []) as SubmissionRow[],
    lines: (lines.data ?? []) as SubmissionLineRow[],
    customLines: (customLines.data ?? []) as SubmissionCustomLineRow[],
    businessCases: (businessCases.data ?? []) as BusinessCaseRow[],
    exercise,
  };
}

export function toCompanyConfig(row: CompanyRow): CompanyConfig {
  return {
    name: row.name,
    budgetYear: row.budget_year,
    openingCash: Number(row.opening_cash),
    openingMrr: Number(row.opening_mrr),
    arpa: Number(row.arpa),
    grossMarginPct: Number(row.gross_margin_pct),
    monthlyChurnPct: Number(row.monthly_churn_pct),
    runwayVigilanceMonths: Number(row.runway_vigilance_months),
    runwayFreezeMonths: Number(row.runway_freeze_months),
    paybackCapMonths: row.payback_cap_months === null ? undefined : Number(row.payback_cap_months),
    seasonalKeys: row.seasonal_keys ?? {},
  };
}

export function toDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    envelope: row.envelope === null ? null : Number(row.envelope),
    isSalesMarketing: row.is_sales_marketing,
  };
}

export function toChannel(row: ChannelRow): Channel {
  return { id: row.id, name: row.name, cacCap: row.cac_cap === null ? null : Number(row.cac_cap) };
}

export function toDriverDef(row: DriverDefRow): DriverDef {
  return {
    id: row.id,
    departmentId: row.department_id,
    code: row.code,
    label: row.label,
    kind: row.kind,
    channelId: row.channel_id ?? undefined,
    monthlyKey: row.monthly_key ?? undefined,
  };
}

export function toSubmission(
  row: SubmissionRow,
  allLines: SubmissionLineRow[],
  allCustomLines: SubmissionCustomLineRow[] = [],
): Submission {
  const lines: SubmissionLine[] = allLines
    .filter((l) => l.submission_id === row.id)
    .map((l) => ({
      driverDefId: l.driver_def_id,
      q: [Number(l.q1), Number(l.q2), Number(l.q3), Number(l.q4)] as QuarterValues,
      unitCost: l.unit_cost === null ? undefined : Number(l.unit_cost),
    }));
  // Les lignes libres du métier s'ajoutent aux lignes du référentiel.
  for (const c of allCustomLines.filter((c) => c.submission_id === row.id)) {
    lines.push({
      id: c.id,
      kind: c.kind,
      label: c.label,
      frequency: c.frequency,
      q: [Number(c.q1), Number(c.q2), Number(c.q3), Number(c.q4)] as QuarterValues,
      isNew: c.is_new,
      vendor: c.vendor ?? undefined,
    });
  }
  // Le moteur ne connaît que brouillon ou soumise : une navette validée reste soumise à ses yeux.
  const status = row.status === 'draft' ? 'draft' : 'submitted';
  return { departmentId: row.department_id, version: row.version, status, lines };
}

/**
 * Version qui fait foi pour la consolidation, par département : la dernière version
 * SOUMISE NON REJETÉE. Une version rejetée est ignorée (on retombe sur la précédente
 * qui fait foi) ; une version validée reste consolidée ; un brouillon ne compte jamais.
 */
export function latestSubmittedByDept(submissions: SubmissionRow[]): Map<string, SubmissionRow> {
  const map = new Map<string, SubmissionRow>();
  for (const s of submissions) {
    if (!CONSOLIDATED_STATUSES.includes(s.status)) continue;
    const cur = map.get(s.department_id);
    if (!cur || s.version > cur.version) map.set(s.department_id, s);
  }
  return map;
}

/**
 * Construit les entrées du moteur à partir des données du portail.
 * Les départements sans navette soumise sont volontairement inclus sans soumission :
 * le moteur produira le contrôle bloquant NAVETTE_MANQUANTE, c'est le comportement voulu.
 */
export function buildConsolidationInputs(data: PortalData): ConsolidationInputs {
  const latest = latestSubmittedByDept(data.submissions);
  const base: ConsolidationInputs = {
    config: toCompanyConfig(data.company),
    departments: data.departments.map(toDepartment),
    channels: data.channels.map(toChannel),
    driverDefs: data.driverDefs.map(toDriverDef),
    submissions: [...latest.values()].map((row) => toSubmission(row, data.lines, data.customLines)),
  };
  // Les business cases acceptes s'ajoutent a la consolidation comme lignes synthetiques
  // (salaires et opex de l'annee 1) sur leur departement cible.
  const accepted: AcceptedBusinessCase[] = (data.businessCases ?? [])
    .filter((bc) => bc.status === 'accepted' && bc.target_department_id)
    .map((bc) => ({
      id: bc.id,
      label: bc.label,
      targetDepartmentId: bc.target_department_id!,
      cogsDepartmentId: bc.cogs_department_id,
      params: bc.params,
    }));
  return accepted.length > 0 ? applyBusinessCases(base, accepted) : base;
}
