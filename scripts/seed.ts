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
import { DEMO_PASSWORD, FINCOPILOT, HEXAFLOOR, type SeedCompany } from '../src/lib/seed-data';

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

async function insertCompany(seed: SeedCompany) {
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
    const { error: lErr } = await sb.from('submission_lines').insert(rows);
    if (lErr) throw new Error(lErr.message);
  }

  console.log(`${cfg.name} : ${seed.departments.length} départements, ${seed.submissions.length} navettes, ${seed.users.length} comptes.`);
}

async function main() {
  for (const seed of [FINCOPILOT, HEXAFLOOR]) {
    console.log(`Remise à zéro de ${seed.config.name}...`);
    await wipeCompany(seed);
    await insertCompany(seed);
  }
  console.log(`\nTerminé. Mot de passe de tous les comptes de démo : ${DEMO_PASSWORD}`);
  console.log('Comptes FinCopilot : cfo@, tech@, sales@, growth@, ops@, fap@ (fincopilot.demo)');
  console.log('Comptes Hexafloor : cfo@, produit@, commerce@, support@ (hexafloor.demo)');
}

main().catch((e) => {
  console.error('Échec du seed :', e instanceof Error ? e.message : e);
  process.exit(1);
});
