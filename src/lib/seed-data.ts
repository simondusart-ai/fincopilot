import type {
  ActualMonthInput,
  BusinessCaseInput,
  CompanyConfig,
  ConsolidationInputs,
  DriverKind,
  LineFrequency,
  QuarterValues,
  Submission,
  SubmissionLine,
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

/** Ligne libre du métier dans une navette de démonstration. */
export interface SeedCustomLine {
  id: string; // slug local
  kind: DriverKind;
  label: string;
  isNew: boolean;
  vendor?: string;
  frequency: LineFrequency;
  q: QuarterValues;
}

export interface SeedSubmission {
  departmentId: string;
  version: number;
  status: 'draft' | 'submitted';
  lines: SeedLine[];
  customLines?: SeedCustomLine[];
}

export interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  role: 'cfo' | 'head_of' | 'ceo';
  departmentId: string | null;
}

/** Business case d'exemple, proposé et ciblé sur un département (slug local). */
export interface BusinessCaseSeed {
  label: string;
  targetDepartmentId: string;
  /** Département qui porte les COGS du projet. Absent = le département cible. */
  cogsDepartmentId?: string;
  params: BusinessCaseInput;
}

export interface SeedCompany {
  config: CompanyConfig;
  /** Base clients au 1er janvier de la premiere annee d'historique. */
  openingClients: number;
  /** Cible de CAC moyen charge, en euros. null = pas de cible. */
  cacAvgTarget: number | null;
  departments: SeedDepartment[];
  channels: SeedChannel[];
  driverDefs: SeedDriverDef[];
  submissions: SeedSubmission[];
  users: SeedUser[];
}

/** P&L annuel realise (structure Annexe A), valeurs en euros. */
export interface PnlYearSeed {
  year: number;
  revenue: number;
  sm: number;
  techProduct: number;
  payrollOther: number;
  ga: number;
  ebitda: number;
  da: number;
  netIncome: number;
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
    budgetYear: 2027,
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
  openingClients: 13_000,
  cacAvgTarget: 515,
  departments: [
    { id: 'fc-tech', code: 'TEC', name: 'Tech & Product', envelope: 5_000_000, isSalesMarketing: false, sort: 1 },
    { id: 'fc-sales', code: 'SAL', name: 'Sales', envelope: 1_200_000, isSalesMarketing: true, sort: 2 },
    { id: 'fc-growth', code: 'GRW', name: 'Growth', envelope: 5_800_000, isSalesMarketing: true, sort: 3 },
    // Enveloppe Ops portee a 3 400 K€ : le scenario rebound loge COGS + structure dans les
    // departements hors S&M sans depassement (le breakeven +140 depasse de 60 K€ le cadrage
    // de structure d'origine). Sans effet sur l'histoire v1/v2 de Growth ni sur la conso seed.
    { id: 'fc-ops', code: 'OPS', name: 'Ops / CS', envelope: 3_400_000, isSalesMarketing: false, sort: 4 },
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
    // Masse salariale Tech saisie en lignes libres par ETP (comme Sales), voir la navette.
    { id: 'fc-tec-opex', departmentId: 'fc-tech', code: 'OPEX', label: 'Licences & outils dev', kind: 'opex', sort: 3 },
    // Sales
    { id: 'fc-sal-mrr', departmentId: 'fc-sales', code: 'NEW_MRR_B2B', label: 'New MRR', kind: 'new_mrr', sort: 1 },
    { id: 'fc-sal-oneoff', departmentId: 'fc-sales', code: 'ONE_SHOT', label: 'Revenus one-shot', kind: 'revenue_other', monthlyKey: 'saison_fiscale', sort: 2 },
    // La masse salariale et les outils de Sales sont saisis en lignes libres (voir la navette).
    // Growth : un couple dépenses / clients par canal
    { id: 'fc-grw-sea-s', departmentId: 'fc-growth', code: 'SEA_SPEND', label: 'Dépenses SEA', kind: 'channel_spend', channelId: 'fc-sea', sort: 1 },
    { id: 'fc-grw-sea-c', departmentId: 'fc-growth', code: 'SEA_CUST', label: 'Nouveaux leads SEA', kind: 'channel_customers', channelId: 'fc-sea', sort: 2 },
    { id: 'fc-grw-seo-s', departmentId: 'fc-growth', code: 'SEO_SPEND', label: 'Dépenses SEO & Content', kind: 'channel_spend', channelId: 'fc-seo', sort: 3 },
    { id: 'fc-grw-seo-c', departmentId: 'fc-growth', code: 'SEO_CUST', label: 'Nouveaux leads SEO & Content', kind: 'channel_customers', channelId: 'fc-seo', sort: 4 },
    { id: 'fc-grw-soc-s', departmentId: 'fc-growth', code: 'SOC_SPEND', label: 'Dépenses Social Ads', kind: 'channel_spend', channelId: 'fc-social', sort: 5 },
    { id: 'fc-grw-soc-c', departmentId: 'fc-growth', code: 'SOC_CUST', label: 'Nouveaux leads Social Ads', kind: 'channel_customers', channelId: 'fc-social', sort: 6 },
    { id: 'fc-grw-par-s', departmentId: 'fc-growth', code: 'PAR_SPEND', label: 'Dépenses affiliation & partenaires', kind: 'channel_spend', channelId: 'fc-part', sort: 7 },
    { id: 'fc-grw-par-c', departmentId: 'fc-growth', code: 'PAR_CUST', label: 'Nouveaux leads affiliation', kind: 'channel_customers', channelId: 'fc-part', sort: 8 },
    // Masse salariale Growth saisie en lignes libres par ETP (comme Sales), voir la navette.
    { id: 'fc-grw-opex', departmentId: 'fc-growth', code: 'OPEX', label: 'Outils marketing & data', kind: 'opex', sort: 10 },
    // Ops / CS
    { id: 'fc-ops-cogs', departmentId: 'fc-ops', code: 'COGS_PROD', label: 'Traitement des déclarations (COGS)', kind: 'cogs', monthlyKey: 'saison_fiscale', sort: 1 },
    { id: 'fc-ops-exp', departmentId: 'fc-ops', code: 'EXPANSION', label: 'Cross-sell & upsell base installée', kind: 'expansion_mrr', sort: 2 },
    { id: 'fc-ops-churn', departmentId: 'fc-ops', code: 'CHURN', label: 'Objectif de churn mensuel', kind: 'churn_rate', sort: 3 },
    // Masse salariale Ops saisie en lignes libres par ETP (comme Sales), voir la navette.
    { id: 'fc-ops-opex', departmentId: 'fc-ops', code: 'OPEX', label: 'Outils support', kind: 'opex', sort: 5 },
    // FA&P (masse salariale en lignes libres par ETP, comme Sales)
    { id: 'fc-fap-opex', departmentId: 'fc-fap', code: 'OPEX', label: 'Frais généraux, assurances, conseils', kind: 'opex', sort: 2 },
  ],
  submissions: [
    {
      departmentId: 'fc-tech',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-tec-cogs', q: q(700, 710, 720, 720) },
        { driverDefId: 'fc-tec-opex', q: q(75, 75, 75, 75) },
      ],
      // Masse salariale en ligne libre : total identique a l'ancien headcount 16/17/18/18 ETP
      // a 8 200 EUR/mois (16 x 3 x 8 200 = 393 600, etc.), donc la consolidation ne bouge pas.
      customLines: [
        { id: 'fc-tec-team', kind: 'payroll', label: 'Équipe Tech & Product', isNew: false, frequency: 'mensuel', q: qn(393_600, 418_200, 442_800, 442_800) },
      ],
    },
    {
      departmentId: 'fc-sales',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-sal-mrr', q: q(15, 18, 20, 22) },
        { driverDefId: 'fc-sal-oneoff', q: q(700, 750, 750, 700) },
      ],
      /*
       * Lignes libres : ETP nominatifs et outils nommés. Les totaux trimestriels sont
       * rigoureusement identiques à l'ancienne structure par drivers :
       * - masse salariale 225 / 235 / 245 / 255 K (Head 45 + SE1 90 + SE2 90 + SE3 0/10/20/30) ;
       * - outils 30 K par trimestre (Hubspot 15 + Aircall 10 + Lemlist 5).
       * Fréquence mensuelle : la mensualisation reste celle des anciennes lignes (1/3 par mois),
       * donc la consolidation est inchangée et les tests de cohérence du seed restent verts.
       */
      customLines: [
        { id: 'fc-sal-head', kind: 'payroll', label: 'Head of Sales', isNew: false, frequency: 'mensuel', q: q(45, 45, 45, 45) },
        { id: 'fc-sal-se1', kind: 'payroll', label: 'Sales executive 1', isNew: false, frequency: 'mensuel', q: q(90, 90, 90, 90) },
        { id: 'fc-sal-se2', kind: 'payroll', label: 'Sales executive 2', isNew: false, frequency: 'mensuel', q: q(90, 90, 90, 90) },
        { id: 'fc-sal-se3', kind: 'payroll', label: 'Sales executive 3', isNew: true, frequency: 'mensuel', q: q(0, 10, 20, 30) },
        { id: 'fc-sal-hubspot', kind: 'opex', label: 'Hubspot', vendor: 'Hubspot', isNew: false, frequency: 'mensuel', q: q(15, 15, 15, 15) },
        { id: 'fc-sal-aircall', kind: 'opex', label: 'Aircall', vendor: 'Aircall', isNew: false, frequency: 'mensuel', q: q(10, 10, 10, 10) },
        { id: 'fc-sal-lemlist', kind: 'opex', label: 'Lemlist', vendor: 'Lemlist', isNew: true, frequency: 'mensuel', q: q(5, 5, 5, 5) },
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
        { driverDefId: 'fc-grw-opex', q: q(60, 65, 65, 60) },
      ],
      customLines: [
        { id: 'fc-grw-team-v1', kind: 'payroll', label: 'Équipe Growth', isNew: false, frequency: 'mensuel', q: q(175, 175, 175, 175) },
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
        { driverDefId: 'fc-grw-opex', q: q(50, 55, 55, 50) },
      ],
      customLines: [
        { id: 'fc-grw-team-v2', kind: 'payroll', label: 'Équipe Growth', isNew: false, frequency: 'mensuel', q: q(175, 175, 175, 175) },
      ],
    },
    {
      departmentId: 'fc-ops',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-ops-cogs', q: q(520, 650, 580, 550) },
        { driverDefId: 'fc-ops-exp', q: q(36, 48, 57, 66) },
        // Objectif de churn a 1,3 %/mois, identique au taux de config : la consolidation ne bouge pas.
        { driverDefId: 'fc-ops-churn', q: qn(1.3, 1.3, 1.3, 1.3) },
        { driverDefId: 'fc-ops-opex', q: q(25, 25, 25, 25) },
      ],
      customLines: [
        { id: 'fc-ops-team', kind: 'payroll', label: 'Équipe Ops / CS', isNew: false, frequency: 'mensuel', q: q(200, 200, 200, 200) },
      ],
    },
    {
      departmentId: 'fc-fap',
      version: 1,
      status: 'submitted',
      lines: [
        { driverDefId: 'fc-fap-opex', q: q(120, 120, 120, 120) },
      ],
      customLines: [
        { id: 'fc-fap-team', kind: 'payroll', label: 'Équipe FA&P', isNew: false, frequency: 'mensuel', q: q(190, 190, 190, 190) },
      ],
    },
  ],
  users: [
    { email: 'cfo@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'Simon Dusart', role: 'cfo', departmentId: null },
    { email: 'ceo@fincopilot.demo', password: DEMO_PASSWORD, fullName: 'CEO FinCopilot', role: 'ceo', departmentId: null },
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
    budgetYear: 2027,
    openingCash: 220_000,
    openingMrr: 120_000,
    arpa: 250,
    grossMarginPct: 0.75,
    monthlyChurnPct: 0.009,
    runwayVigilanceMonths: 15,
    runwayFreezeMonths: 9,
    paybackCapMonths: 24,
  },
  openingClients: 0,
  cacAvgTarget: null,
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
    { id: 'hx-com-out-c', departmentId: 'hx-com', code: 'OUT_CUST', label: 'Nouveaux leads outbound', kind: 'channel_customers', channelId: 'hx-out', sort: 2 },
    { id: 'hx-com-in-s', departmentId: 'hx-com', code: 'IN_SPEND', label: 'Dépenses inbound', kind: 'channel_spend', channelId: 'hx-in', sort: 3 },
    { id: 'hx-com-in-c', departmentId: 'hx-com', code: 'IN_CUST', label: 'Nouveaux leads inbound', kind: 'channel_customers', channelId: 'hx-in', sort: 4 },
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
    { email: 'ceo@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'CEO Hexafloor', role: 'ceo', departmentId: null },
    { email: 'produit@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Produit & Tech', role: 'head_of', departmentId: 'hx-prod' },
    { email: 'commerce@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Commerce', role: 'head_of', departmentId: 'hx-com' },
    { email: 'support@hexafloor.demo', password: DEMO_PASSWORD, fullName: 'Head of Support & Admin', role: 'head_of', departmentId: 'hx-sup' },
  ],
};

/* ----------------------------------------------------------------------------
 * Historique realise FinCopilot (annee N = 2026). Valeurs en euros.
 * Sert a alimenter l'ecran de pilotage et a ancrer les tests du moteur actuals.
 * Hexafloor n'a aucun historique : ses tables restent vides.
 * -------------------------------------------------------------------------- */

/** P&L annuel realise 2024-2026 (structure Annexe A, valeurs en euros). */
export const FINCOPILOT_PNL_YEARS: PnlYearSeed[] = [
  { year: 2024, revenue: 3_600_000, sm: 1_800_000, techProduct: 1_000_000, payrollOther: 1_600_000, ga: 500_000, ebitda: -1_300_000, da: -50_000, netIncome: -1_350_000 },
  { year: 2025, revenue: 8_600_000, sm: 4_000_000, techProduct: 2_000_000, payrollOther: 2_600_000, ga: 800_000, ebitda: -800_000, da: -70_000, netIncome: -870_000 },
  { year: 2026, revenue: 12_000_000, sm: 7_000_000, techProduct: 2_500_000, payrollOther: 3_500_000, ga: 900_000, ebitda: -1_900_000, da: -100_000, netIncome: -2_000_000 },
];

/**
 * Indicateurs mensuels realises 2026 (euros).
 * sm_spend = CAC trimestriel de l'Annexe A x nouveaux clients du mois (estimation
 * documentee dans DOCUMENTATION.md, section Limites). revenue_month : null partout.
 * La tresorerie n'est renseignee qu'a partir de juillet (donnee manquante = null).
 */
export const FINCOPILOT_ACTUALS_2026: ActualMonthInput[] = [
  { month: 1, newClients: 834, churnedClients: 234, mrrEnd: 542_000, revenueMonth: null, smSpend: 350_280, cashEnd: null, nrrMeasured: 1.06 },
  { month: 2, newClients: 953, churnedClients: 233, mrrEnd: 572_000, revenueMonth: null, smSpend: 400_260, cashEnd: null, nrrMeasured: 1.06 },
  { month: 3, newClients: 1210, churnedClients: 250, mrrEnd: 612_000, revenueMonth: null, smSpend: 508_200, cashEnd: null, nrrMeasured: 1.06 },
  { month: 4, newClients: 1015, churnedClients: 247, mrrEnd: 644_000, revenueMonth: null, smSpend: 498_365, cashEnd: null, nrrMeasured: 1.04 },
  { month: 5, newClients: 1150, churnedClients: 262, mrrEnd: 681_000, revenueMonth: null, smSpend: 564_650, cashEnd: null, nrrMeasured: 1.04 },
  { month: 6, newClients: 1195, churnedClients: 259, mrrEnd: 720_000, revenueMonth: null, smSpend: 586_745, cashEnd: null, nrrMeasured: 1.04 },
  { month: 7, newClients: 1039, churnedClients: 271, mrrEnd: 752_000, revenueMonth: null, smSpend: 583_918, cashEnd: 7_400_000, nrrMeasured: 1.01 },
  { month: 8, newClients: 788, churnedClients: 260, mrrEnd: 774_000, revenueMonth: null, smSpend: 442_856, cashEnd: 7_220_000, nrrMeasured: 1.01 },
  { month: 9, newClients: 1307, churnedClients: 275, mrrEnd: 817_000, revenueMonth: null, smSpend: 734_534, cashEnd: 7_010_000, nrrMeasured: 1.01 },
  { month: 10, newClients: 1227, churnedClients: 267, mrrEnd: 857_000, revenueMonth: null, smSpend: 788_961, cashEnd: 6_770_000, nrrMeasured: 0.99 },
  { month: 11, newClients: 1264, churnedClients: 280, mrrEnd: 898_000, revenueMonth: null, smSpend: 812_752, cashEnd: 6_510_000, nrrMeasured: 0.99 },
  { month: 12, newClients: 1131, churnedClients: 291, mrrEnd: 933_000, revenueMonth: null, smSpend: 727_233, cashEnd: 6_230_000, nrrMeasured: 0.99 },
];

/** Hypotheses de la simulation pluriannuelle (memoire Section 2). Montants en K€, ARPA/CAC en €. */
export interface SimulationAssumptionsSeed {
  growth: [number, number, number];
  grossMarginPct: number;
  smGrowth: number;
  smFrozenAmount: number;
  daBase: number;
  daStep: number;
  openingCash: number;
  arrEndN: number;
  arpaMonthly: number;
  monthlyChurn: number;
  baseClientsEndN: number;
  cacTrajectory: number[];
}

/** Simulation FinCopilot : les valeurs du memoire Section 2 (croissance +40 %, S&M gele a 7 000). */
export const FINCOPILOT_SIMULATION: SimulationAssumptionsSeed = {
  growth: [0.4, 0.4, 0.4],
  grossMarginPct: 0.7,
  smGrowth: 0.75,
  smFrozenAmount: 7_000,
  daBase: 110,
  daStep: 10,
  openingCash: 6_230,
  arrEndN: 11_200,
  arpaMonthly: 41,
  monthlyChurn: 0.013,
  baseClientsEndN: 23_225,
  cacTrajectory: [580, 515, 490, 470],
};

/**
 * Business case d'exemple pour FinCopilot : l'offre CGP de la Section 2, en lecture
 * defavorable (VAN negative), proposee et ciblee sur FA&P pour la demonstration d'arbitrage.
 */
export const FINCOPILOT_BUSINESS_CASES: BusinessCaseSeed[] = [
  {
    label: 'Offre CGP',
    targetDepartmentId: 'fc-fap',
    // Dependance inter-metiers : le projet est porte par FA&P, mais le service vendu
    // est produit par Ops / CS, qui en porte donc les COGS dans sa propre navette.
    cogsDepartmentId: 'fc-ops',
    params: {
      label: 'Offre CGP',
      horizonYears: 3,
      discountRate: 0.15,
      years: [
        { revenue: 200_000, recurringCosts: 800_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 30_000, investment: 25_000 },
        { revenue: 600_000, recurringCosts: 1_600_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 30_000 },
        { revenue: 1_200_000, recurringCosts: 3_200_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 30_000 },
      ],
    },
  },
];

/** Construit les entrées du moteur à partir d'une société de seed (dernière version soumise par département). */
export function seedToEngineInputs(seed: SeedCompany): ConsolidationInputs {
  const latest = new Map<string, SeedSubmission>();
  for (const s of seed.submissions) {
    if (s.status !== 'submitted') continue;
    const cur = latest.get(s.departmentId);
    if (!cur || s.version > cur.version) latest.set(s.departmentId, s);
  }
  const submissions: Submission[] = [...latest.values()].map((s) => {
    const lines: SubmissionLine[] = s.lines.map((l) => ({ driverDefId: l.driverDefId, q: l.q, unitCost: l.unitCost }));
    for (const c of s.customLines ?? []) {
      lines.push({
        id: c.id,
        kind: c.kind,
        label: c.label,
        frequency: c.frequency,
        q: c.q,
        isNew: c.isNew,
        vendor: c.vendor,
      });
    }
    return { departmentId: s.departmentId, version: s.version, status: s.status, lines };
  });
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
