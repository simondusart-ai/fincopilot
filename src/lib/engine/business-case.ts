/**
 * Navette : moteur de business case (projet d'investissement).
 * Module pur : aucune dependance a Supabase, au front ou au reseau.
 * Montants en euros. Sorties factuelles uniquement, aucune recommandation redigee.
 *
 * Conventions :
 * - flux en fin d'annee (VAN actualisee a t = 1..horizon) ;
 * - invest one-off porte sur l'annee 1 uniquement ;
 * - payback par interpolation lineaire dans l'annee ou le cumul devient positif.
 * Limites : pas de valeur terminale, pas d'impot sur les societes.
 */

export interface BusinessCaseYearInput {
  revenue: number;
  recurringCosts: number;
  /** ETP dedies au projet sur l'annee. */
  fte: number;
  /** Cout mensuel charge moyen par ETP, en euros. */
  monthlyCostPerFte: number;
  otherOpex: number;
  /** Invest one-off ; pris en compte sur l'annee 1 seulement. */
  investment?: number;
}

export interface BusinessCaseInput {
  label: string;
  /** Horizon en annees, borne a [1, 5]. Defaut 3. */
  horizonYears?: number;
  /** Taux d'actualisation annuel. Defaut 0.15. */
  discountRate?: number;
  years: BusinessCaseYearInput[];
}

export interface BusinessCaseYear {
  year: number;
  revenue: number;
  recurringCosts: number;
  fte: number;
  monthlyCostPerFte: number;
  salaries: number;
  otherOpex: number;
  investment: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  discountedCashFlow: number;
}

export interface BusinessCaseResult {
  label: string;
  horizonYears: number;
  discountRate: number;
  years: BusinessCaseYear[];
  /** Valeur actuelle nette au taux d'actualisation. */
  npv: number;
  /** Cash-flow cumule sur l'horizon. */
  totalCashFlow: number;
  /** Payback en mois, null si le cumul ne devient jamais positif. */
  paybackMonths: number | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function computeBusinessCase(params: BusinessCaseInput): BusinessCaseResult {
  const horizon = clamp(Math.round(params.horizonYears ?? 3), 1, 5);
  const rate = params.discountRate ?? 0.15;

  const years: BusinessCaseYear[] = [];
  let cumulative = 0;
  let npv = 0;
  let paybackMonths: number | null = null;

  for (let i = 0; i < horizon; i++) {
    const y = params.years[i] ?? { revenue: 0, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 };
    const salaries = y.fte * y.monthlyCostPerFte * 12;
    const investment = i === 0 ? y.investment ?? 0 : 0;
    const cashFlow = y.revenue - y.recurringCosts - salaries - y.otherOpex - investment;

    const prevCumulative = cumulative;
    cumulative += cashFlow;

    const t = i + 1;
    const discountedCashFlow = cashFlow / Math.pow(1 + rate, t);
    npv += discountedCashFlow;

    // Premiere annee ou le cumul devient positif : interpolation lineaire dans l'annee.
    if (paybackMonths === null && cumulative >= 0) {
      const needed = -prevCumulative; // montant a couvrir au debut de l'annee
      const fraction = cashFlow > 0 ? clamp(needed / cashFlow, 0, 1) : 0;
      paybackMonths = (i + fraction) * 12;
    }

    years.push({
      year: t,
      revenue: y.revenue,
      recurringCosts: y.recurringCosts,
      fte: y.fte,
      monthlyCostPerFte: y.monthlyCostPerFte,
      salaries,
      otherOpex: y.otherOpex,
      investment,
      cashFlow,
      cumulativeCashFlow: cumulative,
      discountedCashFlow,
    });
  }

  return { label: params.label, horizonYears: horizon, discountRate: rate, years, npv, totalCashFlow: cumulative, paybackMonths };
}
