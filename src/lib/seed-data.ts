import type {
  CompanyConfig,
  ConsolidationInputs,
  DriverKind,
  QuarterValues,
  Submission,
} from './engine';

/**
 * Données de démonstration : deux sociétés fictives.
 * - FinCopilot : le cas du skill test, budget N+1 calé sur le scénario "rebound" de la Section 2
 *   (S&M gelé, plafonds CAC par canal, croissance de CA d'environ +40 %).
 * - Hexafloor : SaaS B2B fictif, 3 départements, pour prouver la réutilisabilité :
 *   même code, autre configuration, et un budget qui déclenche les alertes de runway.
 * Montants en euros. Aucune donnée réelle d'aucune société existante.
 */

export interface SeedDepartment {
  id: string; // slug local, remplacé par un uuid à l'insertion
  code: string;
  name: string;
  envelope: number | null;
  isSalesMarketing: boolean;
  sort: number;
}

export interface SeedChannel {
  id: string;
  name: string;
  cacCap: number | null;
}

export interface SeedDriverDef {
  id: string;
  departmentId: string;
  code: string;
  label: string;
  kind: DriverKind;
  channelId?: string;
  monthlyKey?: string;
  sort: number;
}

export interface SeedLine {
  driverDefId: string;
  q: QuarterValues;
  unitCost?: number;
}

export interface SeedSubmission {
  departmentId: string;
  version: number;
  status: 'draft' | 'submitted';
  lines: SeedLine[];
}

export interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  role: 'cfo' | 'head_of';
  departmentId: string | null;
}

export interface SeedCompany {
  config: CompanyConfig;
  departments: SeedDepartment[];
  channels: SeedChannel[];
  driverDefs: SeedDriverDef[];
  submissions: SeedSubmission[];
  users: SeedUser[];
}

const K = 1000;
const q = (a: number, b: number, c: number, d: number): QuarterValues => [a * K, b * K, c * K, d * K];
const qn = (a: number, b: number, c: number, d: number): QuarterValues => [a, b, c, d];

export const DEMO_PASSWORD = 'Navette-demo-2026';

/* ----------------------------------------------------------------------------
 * FinCopilot : budget N+1, scénario rebound.
 * Points de départ (Annexe A, fin d'année N) : MRR 933 K€, trésorerie 6 230 K€,
 * churn logo mensuel 1,3 %, ARPA ~41 €/mois, S&M gelé à 7 000 K€ (cadrage
 * Sales 1 200 + Growth 5 800), plafonds CAC par canal, seuils runway 18/12 mois.
 * -------------------------------------------------------------------------- */
export const FINCOPILOT: SeedCompany = {
  config: {
    name: 'FinCopilot',
    budgetYear: 2026,
    openingCash: 6_230_000,
    openingMrr: 933_000,
    arpa: 41,
    grossMarginPct: 0.7, // repli : les COGS déclarés en navettes font foi
    monthlyChurnPct: 0.013,
    runwayVigilanceMonths: 18,
    runwayFreezeMonths: 12,
    paybackCapMonths: 18,
    seasonalKeys: {
      // Saisonnalité fiscale : pic de production au printemps (déclarations).
      saison_fiscale: [0.6, 0.6, 0.8, 1.2, 1.6, 1.5, 1.2, 0.8, 0.8, 0.9, 1, 1],
    },
  },
  departments: [
    { id: 'fc-tech', code: 'TEC', name: 'Tech & Product', envelope: 5_000_000, isSalesMarketing: false, sort: 1 },
    { id: 'fc-sales', code: 'SAL', name: 'Sales', envelope: 1_200_000, isSalesMarketing: true, sort: 2 },
    { id: 'fc-growth', code: 'GRW', name: 'Growth', envelope: 5_800_000, isSalesMarketing: true, sort: 3 },
    { id: 'fc-ops', code: 'OPS', name: 'Ops / CS', envelope: 3_300_000, isSalesMarketing: false, sort: 4 },
    { id: 'fc-fap', code: 'FAP', name: 'FA&P', envelope: 1_300_000, isSalesMarketing: false, sort: 5 },
  ],
  channels: [
    { id: 'fc-sea', name: 'SEA', cacCap: 515 },
    { id: 'fc-seo', name: 'SEO & Content', cacCap: 345 },
    { id: 'fc-social', name: 'Social Ads', cacCap: 460 },
    { id: 'fc-part', name: 'Affiliation & partenaires', cacCap: 460 },
  ],
  driverDefs: [
    // Tech & Product
    { id: 'fc-tec-cogs', departmentId: 'fc-tech', code: 'COGS_INFRA', label: 'Hébergement & infra de production (COGS)', kind: 'cogs', sort: 1 },
    { id: 'fc-tec-hc', departmentId: 'fc-tech', code: 'HC', label: 'Effectifs Tech & Product (ETP)', kind: 'headcount', sort: 2 },
    { id: 'fc-tec-opex', departmentId: 'fc-tech', code: 'OPEX', label: 'Licences & outils dev', kind: 'opex', sort: 3 },
    // Sales
    { id: 'fc-sal-mrr', departmentId: 'fc-sales', code: 'NEW_MRR_B2B', label: 'New MRR partenariats B2B', kind: 'new_mrr', sort: 1 },
    { id: 'fc-sal-oneoff', departmentId: 'fc-sales', code: 'ONE_SHOT', label: 'Revenus one-shot (dossiers à l’acte)', kind: 'revenue_other', monthlyKey: 'saison_fiscale', sort: 2 },
    { id: 'fc-sal-pay-head', departmentId: 'fc-sales', code: 'MS_HEAD', label: 'Masse salariale : Head of Sales', kind: 'payroll', sort: 3 },
    { id: 'fc-sal-pay-team', departmentId: 'fc-sales', code: 'MS_TEAM', label: 'Masse salariale : équipe Sales', kind: 'payroll', sort: 4 },
    { id: 'fc-sal-opex', departmentId: 'fc-sales', code: 'OPEX', label: 'Outils & déplacements', kind: 'opex', sort: 5 },
    // Growth : un couple dépenses / clients par canal
    { id: 'fc-grw-sea-s', departmentId: 'fc-growth', code: 'SEA_SPEND', label: 'Dépenses SEA', kind: 'channel_spend', channelId: 'fc-sea', sort: 1 },
    { id: 'fc-grw-sea-c', departmentId: 'fc-growth', code: 'SEA_CUST', label: 'Nouveaux clients SEA', kind: 'channel_customers', channelId: 'fc-sea', sort: 2 },
    { id: 'fc-grw-seo-s', departmentId: 'fc-growth', code: 'SEO_SPEND', label: 'Dépenses SEO & Content', kind: 'channel_spend', channelId: 'fc-seo', sort: 3 },
    { id: 'fc-grw-seo-c', departmentId: 'fc-growth', code: 'SEO_CUST', label: 'Nouveaux clients SEO & Content', kind: 'channel_customers', channelId: 'fc-seo', sort: 4 },
    { id: 'fc-grw-soc-s', departmentId: 'fc-growth', code: 'SOC_SPEND', label: 'Dépenses Social Ads', kind: 'channel_spend', channelId: 'fc-social', sort: 5 },
    { id: 'fc-grw-soc-c', departmentId: 'fc-growth', code: 'SOC_CUST', label: 'Nouveaux clients Social Ads', kind: 'channel_customers', channelId: 'fc-social', sort: 6 },
    { id: 'fc-grw-par-s', departmentId: 'fc-growth', code: 'PAR_SPEND', label: 'Dépenses affiliation & partenaires', kind: 'channel_spend', channelId: 'fc-part', sort: 7 },
    { id: 'fc-grw-par-c', departmentId: 'fc-growth', code: 'PAR_CUST', label: 'Nouveaux clients affiliation', kind: 'channel_customers', channelId: 'fc-part', sort: 8 },
    { id: 'fc-grw-pay', departmentId: 'fc-growth', code: 'MS', label: 'Masse salariale Growth', kind: 'payroll', sort: 9 },
    { id: 'fc-grw-opex', departmentId: 'fc-growth', code: 'OPEX', label: 'Outils marketing & data', kind: 'opex', sort: 10 },
    // Ops / CS
    { id: 'fc-ops-cogs', departmentId: 'fc-ops', code: 'COGS_PROD', label: 'Traitement des déclarations (COGS)', kind: 'cogs', monthlyKey: 'saison_fiscale', sort: 1 },
    { id: 'fc-ops-exp', departmentId: 'fc-ops', code: 'EXPANSION', label: 'Cross-sell & upsell base installée', kind: 'expansion_mrr', sort: 2 },
    { id: 'fc-ops-pay', departmentId: 'fc-ops', code: 'MS', label: 'Masse salariale Ops & CS', kind: 'payroll', sort: 3 },
    { id: 'fc-ops-opex', departmentId: 'fc-ops', code: 'OPEX', label: 'Outils support', kind: 'opex', sort: 4 },
    // FA&P
    { id: 'fc-fap-pay', departmentId: 'fc-fap', code: 'MS', label: 'Masse salariale FA&P', kind: 'payroll', sort: 1 },
    { id: 'fc-fap-opex', departmentId: 'fc-fap', code: 'OPEX', label: 'Frais généraux, assurances, conseils', kind: 'opex', sort: 2 },
  ],
  submissions: [
    {
      departmentId: 'fc-tech',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-tec-cogs', q: q(700, 710, 720, 720) },
        { driverDefId: 'fc-tec-hc', q: qn(16, 17, 18, 18), unitCost: 8_200 },
        { driverDefId: 'fc-tec-opex', q: q(75, 75, 75, 75) },
      ],
    },
    {
      departmentId: 'fc-sales',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-sal-mrr', q: q(15, 18, 20, 22) },
        { driverDefId: 'fc-sal-oneoff', q: q(700, 750, 750, 700) },
        { driverDefId: 'fc-sal-pay-head', q: q(45, 45, 45, 45) },
        { driverDefId: 'fc-sal-pay-team', q: q(180, 190, 200, 210) },
        { driverDefId: 'fc-sal-opex', q: q(30, 30, 30, 30) },
      ],
    },
    // Growth v1 : avant arbitrage. Enveloppe dépassée, CAC SEA et Social hors plafonds.
    {
      departmentId: 'fc-growth',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-grw-sea-s', q: q(620, 620, 600, 600) },
        { driverDefId: 'fc-grw-sea-c', q: qn(950, 975, 985, 990) },
        { driverDefId: 'fc-grw-seo-s', q: q(280, 280, 280, 280) },
        { driverDefId: 'fc-grw-seo-c', q: qn(700, 720, 740, 760) },
        { driverDefId: 'fc-grw-soc-s', q: q(230, 220, 210, 200) },
        { driverDefId: 'fc-grw-soc-c', q: qn(380, 395, 400, 405) },
        { driverDefId: 'fc-grw-par-s', q: q(120, 128, 130, 132) },
        { driverDefId: 'fc-grw-par-c', q: qn(280, 300, 310, 320) },
        { driverDefId: 'fc-grw-pay', q: q(175, 175, 175, 175) },
        { driverDefId: 'fc-grw-opex', q: q(60, 65, 65, 60) },
      ],
    },
    // Growth v2 : après arbitrage codir. SEA retravaillé au S1, enveloppe respectée.
    {
      departmentId: 'fc-growth',
      version: 2,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-grw-sea-s', q: q(500, 505, 495, 489) },
        { driverDefId: 'fc-grw-sea-c', q: qn(950, 975, 985, 990) },
        { driverDefId: 'fc-grw-seo-s', q: q(230, 235, 240, 245) },
        { driverDefId: 'fc-grw-seo-c', q: qn(700, 720, 740, 760) },
        { driverDefId: 'fc-grw-soc-s', q: q(170, 175, 175, 170) },
        { driverDefId: 'fc-grw-soc-c', q: qn(380, 395, 400, 405) },
        { driverDefId: 'fc-grw-par-s', q: q(120, 128, 130, 132) },
        { driverDefId: 'fc-grw-par-c', q: qn(280, 300, 310, 320) },
        { driverDefId: 'fc-grw-pay', q: q(175, 175, 175, 175) },
        { driverDefId: 'fc-grw-opex', q: q(50, 55, 55, 50) },
      ],
    },
    {
      departmentId: 'fc-ops',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-ops-cogs', q: q(520, 650, 580, 550) },
        { driverDefId: 'fc-ops-exp', q: q(36, 48, 57, 66) },
        { driverDefId: 'fc-ops-pay', q: q(200, 200, 200, 200) },
        { driverDefId: 'fc-ops-opex', q: q(25, 25, 25, 25) },
      ],
    },
    {
      departmentId: 'fc-fap',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-fap-pay', q: q(190, 190, 190, 190) },
        { driverDefId: 'fc-fap-opex', q: q(120, 120, 120, 120) },
      ],
    },
  ],
  users: [
    { email: 'cfo@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Simon Dusart', role: 'cfo', departmentId: null },
    { email: 'tech@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Head of Tech & Product', role: 'head_of', departmentId: 'fc-tech' },
    { email: 'sales@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Head of Sales', role: 'head_of', departmentId: 'fc-sales' },
    { email: 'growth@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Head of Growth', role: 'head_of', departmentId: 'fc-growth' },
    { email: 'ops@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Head of Ops & CS', role: 'head_of', departmentId: 'fc-ops' },
    { email: 'fap@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Head of FA&P', role: 'head_of', departmentId: 'fc-fap' },
  ],
};

/* ----------------------------------------------------------------------------
 * Hexafloor : SaaS B2B fictif (logiciel pour poseurs de sols), 3 départements.
 * Même moteur, autre configuration : ARPA 250 €, churn 0,9 %, seuils 15/9 mois.
 * Le budget soumis est volontairement trop ambitieux : trésorerie insuffisante,
 * le moteur doit sortir les alertes runway et trésorerie négative.
 * -------------------------------------------------------------------------- */
export const HEXAFLOOR: SeedCompany = {
  config: {
    name: 'Hexafloor',
    budgetYear: 2026,
    openingCash: 220_000,
    openingMrr: 120_000,
    arpa: 250,
    grossMarginPct: 0.75,
    monthlyChurnPct: 0.009,
    runwayVigilanceMonths: 15,
    runwayFreezeMonths: 9,
    paybackCapMonths: 24,
  },
  departments: [
    { id: 'hx-prod', code: 'PRD', name: 'Produit & Tech', envelope: 1_250_000, isSalesMarketing: false, sort: 1 },
    { id: 'hx-com', code: 'COM', name: 'Commerce', envelope: 1_050_000, isSalesMarketing: true, sort: 2 },
    { id: 'hx-sup', code: 'SUP', name: 'Support & Admin', envelope: 300_000, isSalesMarketing: false, sort: 3 },
  ],
  channels: [
    { id: 'hx-out', name: 'Outbound', cacCap: 1_200 },
    { id: 'hx-in', name: 'Inbound', cacCap: 800 },
  ],
  driverDefs: [
    { id: 'hx-prd-cogs', departmentId: 'hx-prod', code: 'COGS', label: 'Hébergement & onboarding (COGS)', kind: 'cogs', sort: 1 },
    { id: 'hx-prd-hc', departmentId: 'hx-prod', code: 'HC', label: 'Effectifs Produit & Tech (ETP)', kind: 'headcount', sort: 2 },
    { id: 'hx-prd-opex', departmentId: 'hx-prod', code: 'OPEX', label: 'Outils & licences', kind: 'opex', sort: 3 },
    { id: 'hx-com-out-s', departmentId: 'hx-com', code: 'OUT_SPEND', label: 'Dépenses outbound', kind: 'channel_spend', channelId: 'hx-out', sort: 1 },
    { id: 'hx-com-out-c', departmentId: 'hx-com', code: 'OUT_CUST', label: 'Nouveaux clients outbound', kind: 'channel_customers', channelId: 'hx-out', sort: 2 },
    { id: 'hx-com-in-s', departmentId: 'hx-com', code: 'IN_SPEND', label: 'Dépenses inbound', kind: 'channel_spend', channelId: 'hx-in', sort: 3 },
    { id: 'hx-com-in-c', departmentId: 'hx-com', code: 'IN_CUST', label: 'Nouveaux clients inbound', kind: 'channel_customers', channelId: 'hx-in', sort: 4 },
    { id: 'hx-com-pay', departmentId: 'hx-com', code: 'MS', label: 'Masse salariale Commerce', kind: 'payroll', sort: 5 },
    { id: 'hx-com-opex', departmentId: 'hx-com', code: 'OPEX', label: 'Salons & outils', kind: 'opex', sort: 6 },
    { id: 'hx-sup-exp', departmentId: 'hx-sup', code: 'EXPANSION', label: 'Upsell base installée', kind: 'expansion_mrr', sort: 1 },
    { id: 'hx-sup-pay', departmentId: 'hx-sup', code: 'MS', label: 'Masse salariale Support & Admin', kind: 'payroll', sort: 2 },
    { id: 'hx-sup-opex', departmentId: 'hx-sup', code: 'OPEX', label: 'Frais généraux', kind: 'opex', sort: 3 },
  ],
  submissions: [
    {
      departmentId: 'hx-prod',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'hx-prd-cogs', q: q(140, 140, 140, 140) },
        { driverDefId: 'hx-prd-hc', q: qn(6, 6, 7, 7), unitCost: 7_000 },
        { driverDefId: 'hx-prd-opex', q: q(30, 30, 30, 30) },
      ],
    },
    {
      departmentId: 'hx-com',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'hx-com-out-s', q: q(90, 90, 90, 90) },
        { driverDefId: 'hx-com-out-c', q: qn(78, 80, 85, 88) },
        { driverDefId: 'hx-com-in-s', q: q(45, 45, 45, 45) },
        { driverDefId: 'hx-com-in-c', q: qn(60, 65, 70, 75) },
        { driverDefId: 'hx-com-pay', q: q(100, 100, 100, 100) },
        { driverDefId: 'hx-com-opex', q: q(15, 15, 15, 15) },
      ],
    },
    {
      departmentId: 'hx-sup',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'hx-sup-exp', q: q(4, 5, 5, 6) },
        { driverDefId: 'hx-sup-pay', q: q(60, 60, 60, 60) },
        { driverDefId: 'hx-sup-opex', q: q(10, 10, 10, 10) },
      ],
    },
  ],
  users: [
    { email: 'cfo@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'CFO Hexafloor', role: 'cfo', departmentId: null },
    { email: 'produit@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Produit & Tech', role: 'head_of', departmentId: 'hx-prod' },
    { email: 'commerce@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Commerce', role: 'head_of', departmentId: 'hx-com' },
    { email: 'support@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Support & Admin', role: 'head_of', departmentId: 'hx-sup' },
  ],
};

/** Construit les entrées du moteur à partir d'une société de seed (dernière version soumise par département). */
export function seedToEngineInputs(seed: SeedCompany): ConsolidationInputs {
  const latest = new Map<string, SeedSubmission>();
  for (const s of seed.submissions) {
    if (s.status !== 'submitted') continue;
    const cur = latest.get(s.departmentId);
    if (!cur || s.version > cur.version) latest.set(s.departmentId, s);
  }
  const submissions: Submission[] = [...latest.values()].map((s) => ({
    departmentId: s.departmentId,
    version: s.version,
    status: s.status,
    lines: s.lines.map((l) => ({ driverDefId: l.driverDefId, q: l.q, unitCost: l.unitCost })),
  }));
  return {
    config: seed.config,
    departments: seed.departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      envelope: d.envelope,
      isSalesMarketing: d.isSalesMarketing,
    })),
    channels: seed.channels.map((c) => ({ id: c.id, name: c.name, cacCap: c.cacCap })),
    driverDefs: seed.driverDefs.map((d) => ({
      id: d.id,
      departmentId: d.departmentId,
      code: d.code,
      label: d.label,
      kind: d.kind,
      channelId: d.channelId,
      monthlyKey: d.monthlyKey,
    })),
    submissions,
  };
}
