/**
 * Navette : simulation budgetaire pluriannuelle (memoire Section 2).
 * Module pur : aucune dependance a Supabase, au front ou au reseau.
 * TOUS les montants sont en K€ (coherent avec les P&L annuels) ; l'ARPA et le CAC en €.
 *
 * Projette un P&L annuel sur trois exercices (N+1, N+2, N+3) a partir du dernier exercice
 * realise N, selon deux scenarios batis sur le MEME jeu d'hypotheses :
 * - A « as is » (mode growth) : le S&M croit au rythme historique ;
 * - B « rebound » (mode frozen) : le S&M est gele a un montant fixe.
 *
 * Conventions : marge brute = fraction (0,70) ; couts de structure proportionnels a la marge
 * brute au ratio observe en N ; flux operationnel approxime par l'EBITDA (BFR neutre, capex
 * non significatif) ; vue annuelle.
 */

/** Hypotheses de simulation (configuration societe, stockee en base). Montants en K€. */
export interface ScenarioAssumptions {
  /** Croissance du CA en N+1, N+2, N+3 (fractions). */
  growth: [number, number, number];
  /** Marge brute (fraction). */
  grossMarginPct: number;
  /** Scenario A : croissance annuelle du S&M (fraction). */
  smGrowth: number;
  /** Scenario B : montant du S&M gele (K€). */
  smFrozenAmount: number;
  /** Dotations aux amortissements : base et pas annuel (K€). */
  daBase: number;
  daStep: number;
  /** Tresorerie d'ouverture au 1er janvier N+1 (K€). */
  openingCash: number;
  /** ARR de fin d'exercice N (K€). */
  arrEndN: number;
  /** ARPA mensuel (€). */
  arpaMonthly: number;
  /** Churn logo mensuel (fraction). */
  monthlyChurn: number;
  /** Base clients de fin d'exercice N (nombre de comptes). */
  baseClientsEndN: number;
}

/** Dernier exercice realise N (K€). */
export interface ScenarioHistoryYearN {
  ca: number;
  sm: number;
  structure: number;
}

/** Une annee de P&L, realisee ou projetee (K€, sauf ratios en fractions et Rule of 40 en points). */
export interface ScenarioYear {
  ca: number;
  /** Croissance vs annee precedente (fraction). */
  growth: number;
  variableCosts: number;
  grossMargin: number;
  grossMarginPct: number;
  sm: number;
  structure: number;
  ebitda: number;
  ebitdaMarginPct: number;
  da: number;
  ebit: number;
  /** Rule of 40 en POINTS : (croissance + marge EBITDA) x 100. */
  ruleOf40: number;
  /** Tresorerie (K€). 0 pour les annees realisees (le bloc tresorerie ne porte que N+1..N+3). */
  openingCash: number;
  cashFlow: number;
  closingCash: number;
}

/** Effort d'acquisition equivalent pour tenir la croissance a S&M gele. */
export interface CacEffort {
  arrRequired: number;
  deltaArr: number;
  netAdds: number;
  churned: number;
  gross: number;
  cacEquivalent: number;
}

export interface Scenario {
  mode: 'growth' | 'frozen';
  /** Annees projetees N+1, N+2, N+3. */
  years: ScenarioYear[];
  /** Mois avant epuisement de la tresorerie d'ouverture si l'EBITDA de N+1 est negatif, sinon null. */
  depletionMonths: number | null;
}

export interface ScenariosResult {
  asIs: Scenario;
  rebound: Scenario;
  cacEffort: CacEffort;
}

function projectOne(mode: 'growth' | 'frozen', n: ScenarioHistoryYearN, a: ScenarioAssumptions): Scenario {
  const grossMarginN = n.ca * a.grossMarginPct;
  const structureRatio = grossMarginN > 0 ? n.structure / grossMarginN : 0;

  const years: ScenarioYear[] = [];
  let prevCa = n.ca;
  let prevSm = n.sm;
  let opening = a.openingCash;

  for (let t = 1; t <= 3; t++) {
    const growth = a.growth[t - 1];
    const ca = prevCa * (1 + growth);
    const variableCosts = ca * (1 - a.grossMarginPct);
    const grossMargin = ca * a.grossMarginPct;
    const sm = mode === 'growth' ? prevSm * (1 + a.smGrowth) : a.smFrozenAmount;
    const structure = structureRatio * grossMargin;
    const ebitda = grossMargin - sm - structure;
    const da = a.daBase + a.daStep * (t - 1);
    const ebit = ebitda - da;
    const ruleOf40 = (growth + ebitda / ca) * 100;
    const cashFlow = ebitda;
    const closingCash = opening + cashFlow;

    years.push({
      ca,
      growth,
      variableCosts,
      grossMargin,
      grossMarginPct: a.grossMarginPct,
      sm,
      structure,
      ebitda,
      ebitdaMarginPct: ca > 0 ? ebitda / ca : 0,
      da,
      ebit,
      ruleOf40,
      openingCash: opening,
      cashFlow,
      closingCash,
    });

    prevCa = ca;
    prevSm = sm;
    opening = closingCash;
  }

  const ebitdaN1 = years[0].ebitda;
  const depletionMonths = ebitdaN1 < 0 ? a.openingCash / (-ebitdaN1 / 12) : null;
  return { mode, years, depletionMonths };
}

/**
 * Effort d'acquisition equivalent au S&M gele : ARR a ajouter en N+1, converti en clients bruts
 * (ajouts nets pour porter l'ARR + clients a remplacer pour compenser le churn), puis en CAC.
 * Attention aux unites : ARR et S&M en K€ (x1000 pour passer en €), ARPA et CAC en €.
 */
function computeCacEffort(a: ScenarioAssumptions): CacEffort {
  const arrRequired = a.arrEndN * (1 + a.growth[0]);
  const deltaArr = arrRequired - a.arrEndN;
  const netAdds = (deltaArr * 1000) / (a.arpaMonthly * 12);
  const churned = (a.baseClientsEndN + netAdds / 2) * a.monthlyChurn * 12;
  const gross = netAdds + churned;
  const cacEquivalent = gross > 0 ? (a.smFrozenAmount * 1000) / gross : 0;
  return { arrRequired, deltaArr, netAdds, churned, gross, cacEquivalent };
}

/** Projette les deux scenarios (as is / rebound) a partir du meme jeu d'hypotheses. */
export function projectScenarios(n: ScenarioHistoryYearN, a: ScenarioAssumptions): ScenariosResult {
  return {
    asIs: projectOne('growth', n, a),
    rebound: projectOne('frozen', n, a),
    cacEffort: computeCacEffort(a),
  };
}

/**
 * Construit une annee realisee au meme format (pour le tableau N-2..N+3), a partir d'un P&L
 * annuel (K€). Meme decomposition que les projections : les COGS (couts variables) sont
 * 30 % du CA par convention de marge brute, la structure est le reste des charges hors S&M.
 * L'EBITDA retombe exactement sur le realise. `prevCa` = CA de l'annee precedente (null = inconnu).
 */
export function realizedScenarioYear(
  pnl: { ca: number; sm: number; otherCosts: number; da: number },
  prevCa: number | null,
  grossMarginPct: number,
): ScenarioYear {
  const ca = pnl.ca;
  const growth = prevCa !== null && prevCa > 0 ? ca / prevCa - 1 : NaN;
  const variableCosts = ca * (1 - grossMarginPct);
  const grossMargin = ca * grossMarginPct;
  const sm = pnl.sm;
  const structure = pnl.otherCosts - variableCosts;
  const ebitda = grossMargin - sm - structure;
  const da = Math.abs(pnl.da);
  const ebit = ebitda - da;
  const ruleOf40 = Number.isFinite(growth) ? (growth + ebitda / ca) * 100 : NaN;
  return {
    ca,
    growth,
    variableCosts,
    grossMargin,
    grossMarginPct,
    sm,
    structure,
    ebitda,
    ebitdaMarginPct: ca > 0 ? ebitda / ca : 0,
    da,
    ebit,
    ruleOf40,
    openingCash: 0,
    cashFlow: 0,
    closingCash: 0,
  };
}
