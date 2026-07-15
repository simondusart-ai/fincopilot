/**
 * Navette : scenario de reconduction ("si on ne fait rien").
 * Module pur : aucune dependance a Supabase, au front ou au reseau.
 *
 * Projette le P&L de l'annee budgetee AVANT toute navette, en ne supposant AUCUNE
 * action : pas de nouveau MRR, pas d'expansion, pas de recrutement, pas de depense
 * nouvelle. Le detail par navette est impossible (aucune donnee par poste sur N-1),
 * mais le global se projette a partir de ce que l'on sait a fin N-1.
 *
 * Conventions :
 * - Topline : le MRR d'ouverture s'erode du churn mensuel, mois apres mois. Aucun
 *   nouveau client, aucune expansion. Le revenu du mois est le MRR de fin de mois.
 * - Marge brute : taux de la configuration (70 % par defaut). Il porte les couts
 *   VARIABLES, qui suivent le revenu.
 * - SG&A : socle FIXE reconduit de N-1. Il est calibre pour que le modele reproduise
 *   exactement l'EBITDA de N-1 :
 *       fixes = couts totaux N-1 - (1 - taux de marge) x revenu N-1
 *   Sans cette calibration, reconduire les couts totaux N-1 tout en appliquant une
 *   marge brute compterait DEUX FOIS les couts variables.
 * - Tresorerie : cumul de l'EBITDA sur la tresorerie d'ouverture. Runway = tresorerie
 *   / burn moyen des trois derniers mois.
 */

export interface BaselineParams {
  /** MRR au 1er janvier de l'annee budgetee, en euros. */
  openingMrr: number;
  /** Churn mensuel applique au MRR d'ouverture de chaque mois (fraction). Repli par defaut. */
  monthlyChurnPct: number;
  /** Churn mensuel par mois (12 fractions), s'il est fixe en navette. Prioritaire sur le repli. */
  monthlyChurnRates?: number[];
  /** Taux de marge brute de la configuration (fraction). Porte les couts variables. */
  grossMarginPct: number;
  /** Tresorerie au 1er janvier, en euros. */
  openingCash: number;
  /** Revenu realise de l'annee N-1, en euros. */
  prevYearRevenue: number;
  /** Couts totaux realises de l'annee N-1, en euros (structure Annexe A, COGS inclus). */
  prevYearTotalCosts: number;
}

export interface BaselineMonth {
  month: number;
  mrrOpen: number;
  churnedMrr: number;
  mrrEnd: number;
  revenue: number;
  grossMargin: number;
  /** Socle fixe reconduit, reparti lineairement sur les douze mois. */
  fixedCosts: number;
  ebitda: number;
  cash: number;
  runwayMonths: number | null;
  /** Runway BRUT : tresorerie de fin de mois / decaissements du mois (COGS implicite + socle fixe). */
  grossRunwayMonths: number | null;
}

export interface BaselineResult {
  months: BaselineMonth[];
  /** Socle fixe annuel reconduit de N-1, calibre sur son EBITDA. */
  annualFixedCosts: number;
  totals: {
    revenue: number;
    grossMargin: number;
    ebitda: number;
    endCash: number;
    mrrEnd: number;
    minRunway: number | null;
  };
}

/**
 * Socle de couts FIXES reconduit de N-1, calibre pour reproduire l'EBITDA de N-1.
 * Exporte car c'est la convention la plus contre-intuitive du module.
 */
export function reconductedFixedCosts(params: {
  prevYearRevenue: number;
  prevYearTotalCosts: number;
  grossMarginPct: number;
}): number {
  const variableCosts = (1 - params.grossMarginPct) * params.prevYearRevenue;
  return params.prevYearTotalCosts - variableCosts;
}

export function projectBaseline(p: BaselineParams): BaselineResult {
  const annualFixedCosts = reconductedFixedCosts(p);
  const monthlyFixed = annualFixedCosts / 12;

  const months: BaselineMonth[] = [];
  let mrrOpen = p.openingMrr;
  let cash = p.openingCash;
  const ebitdaHistory: number[] = [];

  for (let m = 0; m < 12; m++) {
    const churn = p.monthlyChurnRates?.[m] ?? p.monthlyChurnPct;
    const churnedMrr = mrrOpen * churn;
    // Aucune action : ni nouveau MRR, ni expansion. La topline ne fait que s'eroder.
    const mrrEnd = mrrOpen - churnedMrr;
    const revenue = mrrEnd;
    const grossMargin = revenue * p.grossMarginPct;
    const ebitda = grossMargin - monthlyFixed;

    cash += ebitda;
    ebitdaHistory.push(ebitda);

    const window = ebitdaHistory.slice(-3);
    const avgBurn = window.reduce((a, b) => a + b, 0) / window.length;
    let runwayMonths: number | null;
    if (cash <= 0) runwayMonths = 0;
    else if (avgBurn >= 0) runwayMonths = null;
    else runwayMonths = cash / Math.abs(avgBurn);

    // Runway brut : tresorerie / decaissements du mois. Decaissements = tous les couts cash =
    // revenu - EBITDA (COGS implicite + socle fixe reconduit), aucun encaissement.
    const grossOutflow = revenue - ebitda;
    const grossRunwayMonths = grossOutflow > 0 ? cash / grossOutflow : null;

    months.push({
      month: m + 1,
      mrrOpen,
      churnedMrr,
      mrrEnd,
      revenue,
      grossMargin,
      fixedCosts: monthlyFixed,
      ebitda,
      cash,
      runwayMonths,
      grossRunwayMonths,
    });
    mrrOpen = mrrEnd;
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const runways = months.map((r) => r.runwayMonths).filter((v): v is number => v !== null);

  return {
    months,
    annualFixedCosts,
    totals: {
      revenue: sum(months.map((r) => r.revenue)),
      grossMargin: sum(months.map((r) => r.grossMargin)),
      ebitda: sum(months.map((r) => r.ebitda)),
      endCash: months[11].cash,
      mrrEnd: months[11].mrrEnd,
      minRunway: runways.length > 0 ? Math.min(...runways) : null,
    },
  };
}
