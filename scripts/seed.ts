/**
 * Seed des données de démonstration dans Supabase.
 *
 * Usage (jamais commiter la clé service_role) :
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/seed.ts
 *
 * Le script est rejouable : il supprime puis recrée les deux sociétés de démo
 * (FinCopilot, Hexafloor) et leurs comptes utilisateurs. Idéal pour remettre
 * la démo à zéro en trente secondes avant une présentation.
 */
import { createClient } from '@supabase/supabase-js';
import {
  DEMO_PASSWORD,
  FINCOPILOT,
  FINCOPILOT_ACTUALS_2026,
  FINCOPILOT_BUSINESS_CASES,
  FINCOPILOT_PNL_YEARS,
  FINCOPILOT_SIMULATION,
  HEXAFLOOR,
  type BusinessCaseSeed,
  type PnlYearSeed,
  type SeedCompany,
  type SimulationAssumptionsSeed,
} from '../src/lib/seed-data';
import type { ActualMonthInput } from '../src/lib/engine';

interface CompanyHistory {
  pnlYears: PnlYearSeed[];
  actuals: ActualMonthInput[];
  businessCases?: BusinessCaseSeed[];
  simulation?: SimulationAssumptionsSeed;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Variables requises : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function wipeCompany(seed: SeedCompany) {
  const { data: companies, error } = await sb.from('companies').select('id').eq('name', seed.config.name);
  if (error) throw new Error(error.message);
  for (const c of companies ?? []) {
    // Ordre de suppression : les contraintes on delete restrict (submission_lines vers
    // driver_defs, driver_defs vers channels) interdisent de tout effacer par la seule
    // cascade de la societe. On retire d'abord les navettes (cascade sur submission_lines)
    // puis les drivers, avant de supprimer la societe (cascade sur le reste).
    const { data: depts, error: dErr } = await sb.from('departments').select('id').eq('company_id', c.id);
    if (dErr) throw new Error(dErr.message);
    const deptIds = (depts ?? []).map((d) => d.id);
    if (deptIds.length > 0) {
      const { error: sErr } = await sb.from('submissions').delete().in('department_id', deptIds);
      if (sErr) throw new Error(sErr.message);
      const { error: ddErr } = await sb.from('driver_defs').delete().in('department_id', deptIds);
      if (ddErr) throw new Error(ddErr.message);
    }
    const { error: delErr } = await sb.from('companies').delete().eq('id', c.id);
    if (delErr) throw new Error(delErr.message);
  }
  // Suppression des comptes de démo (par email)
  const emails = new Set(seed.users.map((u) => u.email));
  let page = 1;
  for (;;) {
    const { data, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) throw new Error(listErr.message);
    for (const user of data.users) {
      if (user.email && emails.has(user.email)) {
        const { error: uErr } = await sb.auth.admin.deleteUser(user.id);
        if (uErr) throw new Error(uErr.message);
      }
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
}

async function insertCompany(seed: SeedCompany, history?: CompanyHistory) {
  const cfg = seed.config;
  const { data: company, error: cErr } = await sb
    .from('companies')
    .insert({
      name: cfg.name,
      budget_year: cfg.budgetYear,
      opening_cash: cfg.openingCash,
      opening_mrr: cfg.openingMrr,
      arpa: cfg.arpa,
      gross_margin_pct: cfg.grossMarginPct,
      monthly_churn_pct: cfg.monthlyChurnPct,
      runway_vigilance_months: cfg.runwayVigilanceMonths,
      runway_freeze_months: cfg.runwayFreezeMonths,
      payback_cap_months: cfg.paybackCapMonths ?? null,
      seasonal_keys: cfg.seasonalKeys ?? {},
      opening_clients: seed.openingClients,
      cac_avg_target: seed.cacAvgTarget,
    })
    .select()
    .single();
  if (cErr) throw new Error(cErr.message);

  // Départements
  const deptIds = new Map<string, string>();
  for (const d of seed.departments) {
    const { data, error } = await sb
      .from('departments')
      .insert({
        company_id: company.id,
        code: d.code,
        name: d.name,
        envelope: d.envelope,
        is_sales_marketing: d.isSalesMarketing,
        sort: d.sort,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    deptIds.set(d.id, data.id);
  }

  // Canaux
  const channelIds = new Map<string, string>();
  for (const c of seed.channels) {
    const { data, error } = await sb
      .from('channels')
      .insert({ company_id: company.id, name: c.name, cac_cap: c.cacCap })
      .select()
      .single();
    if (error) throw new Error(error.message);
    channelIds.set(c.id, data.id);
  }

  // Drivers
  const defIds = new Map<string, string>();
  for (const def of seed.driverDefs) {
    const { data, error } = await sb
      .from('driver_defs')
      .insert({
        department_id: deptIds.get(def.departmentId)!,
        code: def.code,
        label: def.label,
        kind: def.kind,
        channel_id: def.channelId ? channelIds.get(def.channelId)! : null,
        monthly_key: def.monthlyKey ?? null,
        sort: def.sort,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    defIds.set(def.id, data.id);
  }

  // Utilisateurs et profils
  const userIds = new Map<string, string>();
  for (const u of seed.users) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw new Error(`${u.email} : ${error.message}`);
    userIds.set(u.email, data.user.id);
    const { error: pErr } = await sb.from('profiles').insert({
      user_id: data.user.id,
      company_id: company.id,
      department_id: u.departmentId ? deptIds.get(u.departmentId)! : null,
      role: u.role,
      full_name: u.fullName,
    });
    if (pErr) throw new Error(pErr.message);
  }

  // Navettes : créées au nom du Head of du département (ou du CFO à défaut)
  const headByDept = new Map(seed.users.filter((u) => u.departmentId).map((u) => [u.departmentId!, u.email]));
  const cfoEmail = seed.users.find((u) => u.role === 'cfo')!.email;
  for (const sub of seed.submissions) {
    const creatorEmail = headByDept.get(sub.departmentId) ?? cfoEmail;
    const { data, error } = await sb
      .from('submissions')
      .insert({
        department_id: deptIds.get(sub.departmentId)!,
        version: sub.version,
        status: sub.status,
        created_by: userIds.get(creatorEmail)!,
        submitted_at: sub.status === 'submitted' ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const rows = sub.lines.map((l) => ({
      submission_id: data.id,
      driver_def_id: defIds.get(l.driverDefId)!,
      q1: l.q[0],
      q2: l.q[1],
      q3: l.q[2],
      q4: l.q[3],
      unit_cost: l.unitCost ?? null,
    }));
    if (rows.length > 0) {
      const { error: lErr } = await sb.from('submission_lines').insert(rows);
      if (lErr) throw new Error(lErr.message);
    }

    // Lignes libres du metier (postes nominatifs, outils nommes).
    if (sub.customLines && sub.customLines.length > 0) {
      const customRows = sub.customLines.map((c, i) => ({
        submission_id: data.id,
        kind: c.kind,
        label: c.label,
        is_new: c.isNew,
        vendor: c.vendor ?? null,
        frequency: c.frequency,
        sort: i, // ordre d'affichage : les ajouts ulterieurs passent a la suite
        q1: c.q[0],
        q2: c.q[1],
        q3: c.q[2],
        q4: c.q[3],
      }));
      const { error: clErr } = await sb.from('submission_custom_lines').insert(customRows);
      if (clErr) throw new Error(clErr.message);
    }
  }

  // Historique realise (P&L annuel et indicateurs mensuels). L'annee des mensuels
  // est l'annee N = budget_year - 1. Les societes sans historique n'en inserent aucun.
  if (history) {
    const pnlRows = history.pnlYears.map((p) => ({
      company_id: company.id,
      year: p.year,
      revenue: p.revenue,
      sm: p.sm,
      tech_product: p.techProduct,
      payroll_other: p.payrollOther,
      ga: p.ga,
      ebitda: p.ebitda,
      da: p.da,
      net_income: p.netIncome,
    }));
    if (pnlRows.length > 0) {
      const { error } = await sb.from('pnl_years').insert(pnlRows);
      if (error) throw new Error(error.message);
    }

    const actualsYear = cfg.budgetYear - 1;
    const monthlyRows = history.actuals.map((m) => ({
      company_id: company.id,
      year: actualsYear,
      month: m.month,
      new_clients: m.newClients,
      churned_clients: m.churnedClients,
      mrr_end: m.mrrEnd,
      revenue_month: m.revenueMonth,
      sm_spend: m.smSpend,
      cash_end: m.cashEnd,
      nrr_measured: m.nrrMeasured,
    }));
    if (monthlyRows.length > 0) {
      const { error } = await sb.from('monthly_actuals').insert(monthlyRows);
      if (error) throw new Error(error.message);
    }
    console.log(`${cfg.name} : historique ${pnlRows.length} exercice(s) P&L, ${monthlyRows.length} mois realises (${actualsYear}).`);

    // Business cases d'exemple, proposes et cibles sur un departement, crees au nom du CFO.
    if (history.businessCases && history.businessCases.length > 0) {
      const bcRows = history.businessCases.map((bc) => ({
        company_id: company.id,
        department_id: null,
        target_department_id: deptIds.get(bc.targetDepartmentId)!,
        cogs_department_id: bc.cogsDepartmentId ? deptIds.get(bc.cogsDepartmentId)! : null,
        label: bc.label,
        params: bc.params,
        status: 'proposed',
        created_by: userIds.get(cfoEmail)!,
      }));
      const { error } = await sb.from('business_cases').insert(bcRows);
      if (error) throw new Error(error.message);
      console.log(`${cfg.name} : ${bcRows.length} business case(s) propose(s).`);
    }

    // Hypotheses de la simulation pluriannuelle (societes concernees uniquement).
    if (history.simulation) {
      const s = history.simulation;
      const { error } = await sb.from('simulation_assumptions').insert({
        company_id: company.id,
        growth_n1: s.growth[0],
        growth_n2: s.growth[1],
        growth_n3: s.growth[2],
        gross_margin_pct: s.grossMarginPct,
        sm_growth: s.smGrowth,
        sm_frozen_amount: s.smFrozenAmount,
        da_base: s.daBase,
        da_step: s.daStep,
        opening_cash: s.openingCash,
        arr_end_n: s.arrEndN,
        arpa_monthly: s.arpaMonthly,
        monthly_churn: s.monthlyChurn,
        base_clients_end_n: s.baseClientsEndN,
        cac_trajectory: s.cacTrajectory,
      });
      if (error) throw new Error(error.message);
      console.log(`${cfg.name} : hypotheses de simulation renseignees.`);
    }
  }

  console.log(`${cfg.name} : ${seed.departments.length} départements, ${seed.submissions.length} navettes, ${seed.users.length} comptes.`);
}

async function main() {
  const jobs: Array<[SeedCompany, CompanyHistory | undefined]> = [
    [FINCOPILOT, { pnlYears: FINCOPILOT_PNL_YEARS, actuals: FINCOPILOT_ACTUALS_2026, businessCases: FINCOPILOT_BUSINESS_CASES, simulation: FINCOPILOT_SIMULATION }],
    [HEXAFLOOR, undefined],
  ];
  for (const [seed, history] of jobs) {
    console.log(`Remise à zéro de ${seed.config.name}...`);
    await wipeCompany(seed);
    await insertCompany(seed, history);
  }
  console.log(`\nTerminé. Mot de passe de tous les comptes de démo : ${DEMO_PASSWORD}`);
  console.log('Comptes FinCopilot : cfo@, ceo@, tech@, sales@, growth@, ops@, fap@ (fincopilot.demo)');
  console.log('Comptes Hexafloor : cfo@, ceo@, produit@, commerce@, support@ (hexafloor.demo)');
}

main().catch((e) => {
  console.error('Échec du seed :', e instanceof Error ? e.message : e);
  process.exit(1);
});
