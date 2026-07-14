import { getSupabase } from './supabase';
import type {
  Channel,
  CompanyConfig,
  ConsolidationInputs,
  Department,
  DriverDef,
  DriverKind,
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
}

export interface ProfileRow {
  user_id: string;
  company_id: string;
  department_id: string | null;
  role: 'cfo' | 'head_of';
  full_name: string;
}

export interface SubmissionRow {
  id: string;
  department_id: string;
  version: number;
  status: 'draft' | 'submitted';
  created_by: string;
  submitted_at: string | null;
  created_at: string;
}

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

export interface PortalData {
  profile: ProfileRow;
  company: CompanyRow;
  departments: DepartmentRow[];
  channels: ChannelRow[];
  driverDefs: DriverDefRow[];
  submissions: SubmissionRow[];
  lines: SubmissionLineRow[];
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

  const [companies, departments, channels, driverDefs, submissions, lines] = await Promise.all([
    supabase.from('companies').select('*').eq('id', profile.company_id).single(),
    supabase.from('departments').select('*').order('sort'),
    supabase.from('channels').select('*').order('name'),
    supabase.from('driver_defs').select('*').order('sort'),
    supabase.from('submissions').select('*').order('version'),
    supabase.from('submission_lines').select('*'),
  ]);
  const firstError = companies.error ?? departments.error ?? channels.error ?? driverDefs.error ?? submissions.error ?? lines.error;
  if (firstError) throw new Error(`Erreur de chargement : ${firstError.message}`);

  return {
    profile: profile as ProfileRow,
    company: companies.data as CompanyRow,
    departments: (departments.data ?? []) as DepartmentRow[],
    channels: (channels.data ?? []) as ChannelRow[],
    driverDefs: (driverDefs.data ?? []) as DriverDefRow[],
    submissions: (submissions.data ?? []) as SubmissionRow[],
    lines: (lines.data ?? []) as SubmissionLineRow[],
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

export function toSubmission(row: SubmissionRow, allLines: SubmissionLineRow[]): Submission {
  const lines: SubmissionLine[] = allLines
    .filter((l) => l.submission_id === row.id)
    .map((l) => ({
      driverDefId: l.driver_def_id,
      q: [Number(l.q1), Number(l.q2), Number(l.q3), Number(l.q4)] as QuarterValues,
      unitCost: l.unit_cost === null ? undefined : Number(l.unit_cost),
    }));
  return { departmentId: row.department_id, version: row.version, status: row.status, lines };
}

/** Dernière version soumise par département (celle qui fait foi pour la consolidation). */
export function latestSubmittedByDept(submissions: SubmissionRow[]): Map<string, SubmissionRow> {
  const map = new Map<string, SubmissionRow>();
  for (const s of submissions) {
    if (s.status !== 'submitted') continue;
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
  return {
    config: toCompanyConfig(data.company),
    departments: data.departments.map(toDepartment),
    channels: data.channels.map(toChannel),
    driverDefs: data.driverDefs.map(toDriverDef),
    submissions: [...latest.values()].map((row) => toSubmission(row, data.lines)),
  };
}
