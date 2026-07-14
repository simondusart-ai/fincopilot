/**
 * Navette : moteur de consolidation budgétaire.
 * Module pur : aucune dépendance à Supabase, au front ou au réseau.
 * Toutes les valeurs monétaires sont en euros. Les pourcentages sont des fractions (0.70 = 70 %).
 */

/** Configuration société : tout ce qui est spécifique à une entreprise vit ici, jamais dans le code. */
export interface CompanyConfig {
  name: string;
  /** Année budgétée (ex. 2026 pour le budget N+1). */
  budgetYear: number;
  /** Trésorerie d'ouverture au 1er janvier de l'année budgétée, en euros. */
  openingCash: number;
  /** MRR d'ouverture au 1er janvier, en euros. */
  openingMrr: number;
  /** Revenu moyen par compte, en euros par mois. */
  arpa: number;
  /** Marge brute, fraction de 0 à 1. */
  grossMarginPct: number;
  /** Churn mensuel appliqué au MRR d'ouverture de chaque mois, fraction de 0 à 1. */
  monthlyChurnPct: number;
  /** Seuil de vigilance sur le runway, en mois (ex. 18). */
  runwayVigilanceMonths: number;
  /** Seuil de gel par défaut sur le runway, en mois (ex. 12). */
  runwayFreezeMonths: number;
  /** Plafond de payback brut toléré, en mois (ex. 18). Optionnel. */
  paybackCapMonths?: number;
  /**
   * Clés de mensualisation nommées : 12 coefficients (janvier à décembre).
   * Au sein d'un trimestre, la valeur trimestrielle est répartie au prorata des coefficients.
   * Une clé absente ou invalide équivaut à une répartition linéaire (1/3 par mois).
   */
  seasonalKeys?: Record<string, number[]>;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  /** Enveloppe annuelle de cadrage codir, en euros. null = pas d'enveloppe. */
  envelope: number | null;
  /** true si les coûts du département comptent dans le S&M (marge de contribution, CAC). */
  isSalesMarketing: boolean;
}

export type DriverKind =
  | 'new_mrr' // nouveau MRR ajouté, en euros par trimestre (flux)
  | 'expansion_mrr' // MRR d'expansion (upsell), en euros par trimestre (flux)
  | 'revenue_other' // revenus non récurrents (one-shot, prestations), en euros par trimestre (flux)
  | 'headcount' // effectifs en ETP par trimestre (niveau), coût unitaire mensuel saisi sur la ligne
  | 'payroll' // masse salariale directe, en euros par trimestre (flux)
  | 'opex' // dépenses hors salaires, en euros par trimestre (flux)
  | 'cogs' // coût des ventes du département, en euros par trimestre (flux)
  | 'channel_spend' // dépenses d'acquisition d'un canal, en euros par trimestre (flux)
  | 'channel_customers' // nouveaux clients d'un canal, en nombre par trimestre (flux)
  | 'capex'; // investissement, en euros par trimestre : hors EBITDA, déduit de la trésorerie

/**
 * Fréquence de décaissement d'une ligne, qui pilote sa mensualisation :
 * - mensuel et annuel : répartition linéaire, un tiers du trimestre chaque mois ;
 * - trimestriel : 100 % au dernier mois du trimestre ;
 * - one_shot : 100 % au premier mois du trimestre saisi.
 * Propriété garantie dans tous les cas : la somme des 12 mois égale la somme des 4 trimestres.
 */
export type LineFrequency = 'mensuel' | 'trimestriel' | 'annuel' | 'one_shot';

export interface DriverDef {
  id: string;
  departmentId: string;
  code: string;
  label: string;
  kind: DriverKind;
  /** Pour channel_spend et channel_customers : canal d'acquisition associé. */
  channelId?: string;
  /** Nom d'une clé de mensualisation de la config. Absent = linéaire. */
  monthlyKey?: string;
}

export interface Channel {
  id: string;
  name: string;
  /** Plafond de CAC décidé au codir, en euros. null = pas de plafond. */
  cacCap: number | null;
}

/** Quatre valeurs trimestrielles saisies par le Head of. */
export type QuarterValues = [number, number, number, number];

/** Ligne rattachée à un driver du référentiel (configuration société). */
export interface DriverSubmissionLine {
  driverDefId: string;
  q: QuarterValues;
  /** Pour les lignes headcount : coût mensuel moyen chargé par ETP, en euros. */
  unitCost?: number;
}

/**
 * Ligne libre saisie par le métier : elle porte elle-même son type, son libellé et sa
 * fréquence de décaissement, sans passer par le référentiel de drivers.
 */
export interface InlineSubmissionLine {
  /** Identifiant stable de la ligne (table submission_custom_lines). */
  id: string;
  kind: DriverKind;
  label: string;
  frequency: LineFrequency;
  q: QuarterValues;
  /** true si le poste est nouveau, false s'il est reconduit. */
  isNew?: boolean;
  /** Fournisseur, pour les lignes d'outils et de dépenses. */
  vendor?: string;
}

export type SubmissionLine = DriverSubmissionLine | InlineSubmissionLine;

/** Discrimine une ligne libre d'une ligne de référentiel. */
export function isInlineLine(line: SubmissionLine): line is InlineSubmissionLine {
  return 'kind' in line;
}

/** Types admis pour une ligne libre : ni effectifs (coût unitaire), ni canaux (référence canal). */
export const INLINE_KINDS: ReadonlyArray<DriverKind> = [
  'new_mrr',
  'expansion_mrr',
  'revenue_other',
  'payroll',
  'opex',
  'cogs',
  'capex',
];

export type SubmissionStatus = 'draft' | 'submitted';

export interface Submission {
  departmentId: string;
  version: number;
  status: SubmissionStatus;
  lines: SubmissionLine[];
}

export interface ConsolidationInputs {
  config: CompanyConfig;
  departments: Department[];
  driverDefs: DriverDef[];
  channels: Channel[];
  /** Une soumission par département (la dernière version soumise). */
  submissions: Submission[];
}

export type AlertSeverity = 'bloquant' | 'alerte';

export interface Alert {
  severity: AlertSeverity;
  /** Code stable, utilisable par le front et les tests. */
  code: string;
  /** Message en français, factuel, sans rédaction libre. */
  message: string;
  departmentId?: string;
  channelId?: string;
  /** Mois concerné, 1 à 12. */
  month?: number;
  /** Trimestre concerné, 1 à 4. */
  quarter?: number;
}

/** Ligne mensuelle du P&L consolidé. Tous les montants en euros. */
export interface MonthRow {
  month: number; // 1 à 12
  mrrOpen: number;
  newMrr: number;
  expansionMrr: number;
  churnedMrr: number;
  mrrEnd: number;
  /** Revenus non récurrents du mois (lignes revenue_other). */
  otherRevenue: number;
  /** Convention : revenu du mois = MRR de fin de mois + revenus non récurrents. */
  revenue: number;
  /** COGS du mois (lignes cogs). Zéro si la société n'en déclare pas. */
  cogsTotal: number;
  /**
   * Marge brute : revenu - COGS déclarés si la société a des lignes COGS,
   * sinon revenu x taux de marge brute de la config.
   */
  grossMargin: number;
  /** Coûts totaux des départements S&M sur le mois. */
  smSpend: number;
  contributionMargin: number;
  contributionMarginPct: number | null;
  payrollTotal: number;
  opexTotal: number;
  /** Coûts totaux départements, COGS inclus (salaires + opex + canaux + COGS). */
  totalDeptCosts: number;
  /** Capex du mois : hors EBITDA et hors marge de contribution, mais déduit de la trésorerie. */
  capexTotal: number;
  /** EBITDA = marge brute - coûts départements hors COGS et hors capex. */
  ebitda: number;
  /** Trésorerie de fin de mois : cumul de (EBITDA - capex). */
  cash: number;
  /** Runway en mois (trésorerie / flux de trésorerie moyen des 3 derniers mois). null si pas de burn. */
  runwayMonths: number | null;
  /** NRR annualisé du mois : ((MRR ouvert + expansion - churn) / MRR ouvert) ^ 12. */
  nrrAnnualized: number | null;
}

export interface DeptRow {
  departmentId: string;
  code: string;
  name: string;
  monthlyCosts: number[]; // 12 valeurs
  annualCost: number;
  envelope: number | null;
  /** Dépassement d'enveloppe en euros (positif), null si pas d'enveloppe ou pas de dépassement. */
  envelopeOverrun: number | null;
  /** MRR annuel ajouté par le département (new + expansion), en euros. */
  annualMrrAdded: number;
}

export interface ChannelQuarterRow {
  channelId: string;
  name: string;
  quarter: number; // 1 à 4
  spend: number;
  newCustomers: number;
  /** CAC du trimestre. null si aucun client prévu. */
  cac: number | null;
  cacCap: number | null;
}

export interface ConsolidationTotals {
  revenue: number;
  /** Revenus non récurrents de l'année. */
  otherRevenueAnnual: number;
  /** COGS déclarés de l'année (zéro si la société n'en déclare pas). */
  cogsAnnual: number;
  grossMargin: number;
  /** Marge brute effective du budget (marge brute / revenu), utilisée pour le payback. */
  effectiveGrossMarginPct: number | null;
  ebitda: number;
  endCash: number;
  /** Runway minimum observé sur l'année, null si jamais en burn. */
  minRunway: number | null;
  newMrrAnnual: number;
  expansionMrrAnnual: number;
  churnedMrrAnnual: number;
  mrrEnd: number;
  /** CAC moyen pondéré de l'année (toutes dépenses canaux / tous nouveaux clients). */
  blendedCac: number | null;
  /** Payback brut du CAC moyen : CAC / (ARPA x marge brute), en mois. */
  grossPaybackMonths: number | null;
}

export interface ConsolidationResult {
  /** false si au moins un contrôle bloquant a échoué : dans ce cas aucun chiffre n'est produit. */
  ok: boolean;
  blocking: Alert[];
  warnings: Alert[];
  months: MonthRow[];
  departments: DeptRow[];
  channelQuarters: ChannelQuarterRow[];
  totals: ConsolidationTotals | null;
}

/** Diff entre deux versions de navette d'un même département. */
export interface LineDiff {
  /** Clé stable de la ligne : id du driver, ou libellé pour une ligne libre. */
  key: string;
  /** Driver du référentiel. Absent pour une ligne libre. */
  driverDefId?: string;
  /** true si la ligne est une ligne libre saisie par le métier. */
  isCustom: boolean;
  label: string;
  kind: DriverKind;
  before: QuarterValues | null; // null = ligne ajoutée
  after: QuarterValues | null; // null = ligne supprimée
  unitCostBefore?: number;
  unitCostAfter?: number;
  /** Variation annuelle en euros de l'impact de la ligne (coût ou MRR ajouté selon le kind). */
  deltaAnnual: number;
}

export interface SubmissionDiff {
  departmentId: string;
  versionBefore: number;
  versionAfter: number;
  lines: LineDiff[];
  /** Impact consolidé si les entrées complètes sont fournies. */
  impact: {
    deltaEbitda: number;
    deltaEndCash: number;
    minRunwayBefore: number | null;
    minRunwayAfter: number | null;
  } | null;
}
