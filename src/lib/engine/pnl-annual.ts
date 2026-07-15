/**
 * Navette : P&L annuel a la structure du Budget (pour l'ecran Pilotage). Module pur.
 *
 * Annees realisees : les COGS ne sont pas isoles dans pnl_years (structure Annexe A). Par
 * convention de marge brute (70 % en Section 1), on loge les couts variables (COGS) a 30 %
 * du CA, et le reste des charges (tech_product + payroll_other + ga) moins ces COGS devient
 * les couts de structure. Ainsi l'EBITDA retombe exactement sur l'Annexe A.
 * Budget : memes lignes, calculees depuis la consolidation (structure = couts hors COGS et
 * hors S&M).
 */
export interface AnnualPnl {
  revenue: number;
  cogs: number;
  grossMargin: number;
  sm: number;
  contribution: number;
  structure: number;
  ebitda: number;
}

/** P&L annuel d'une annee realisee (pnl_years), COGS deduits par le taux de marge brute. */
export function realizedAnnualPnl(
  py: { revenue: number; sm: number; techProduct: number; payrollOther: number; ga: number },
  cogsRate: number,
): AnnualPnl {
  const revenue = py.revenue;
  const cogs = cogsRate * revenue;
  const grossMargin = revenue - cogs;
  const sm = py.sm;
  const contribution = grossMargin - sm;
  const structure = py.techProduct + py.payrollOther + py.ga - cogs;
  const ebitda = contribution - structure;
  return { revenue, cogs, grossMargin, sm, contribution, structure, ebitda };
}

/**
 * P&L annuel du budget, depuis la consolidation. `smAnnual` = S&M de l'annee ; `sgnaAnnual`
 * = salaires + opex de tous les departements (couts hors COGS et hors capex). La structure =
 * sgnaAnnual - smAnnual (couts hors COGS et hors S&M).
 */
export function budgetAnnualPnl(
  totals: { revenue: number; cogsAnnual: number; grossMargin: number; ebitda: number },
  smAnnual: number,
  sgnaAnnual: number,
): AnnualPnl {
  const revenue = totals.revenue;
  const cogs = totals.cogsAnnual;
  const grossMargin = totals.grossMargin;
  const sm = smAnnual;
  const contribution = grossMargin - sm;
  const structure = sgnaAnnual - sm;
  const ebitda = totals.ebitda;
  return { revenue, cogs, grossMargin, sm, contribution, structure, ebitda };
}
