import { describe, expect, it } from 'vitest';
import { projectScenarios, type ScenarioAssumptions, type ScenarioHistoryYearN } from '../scenario';

/**
 * Ancres numeriques du memoire Section 2 (FinCopilot). Si un test ne colle pas, c'est le code
 * qu'on corrige, jamais l'ancre. Tolerances : 0,5 K€ sur les montants, 0,1 point sur les %,
 * 1 client / 1 € sur le bloc CAC.
 */
const N: ScenarioHistoryYearN = { ca: 12_000, sm: 7_000, structure: 3_300 };
const A: ScenarioAssumptions = {
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
};

const near = (actual: number, expected: number, tol: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe('projectScenarios : ancres du memoire Section 2', () => {
  const res = projectScenarios(N, A);

  it('CA identique dans les deux scenarios : 16 800 / 23 520 / 32 928', () => {
    for (const s of [res.asIs, res.rebound]) {
      near(s.years[0].ca, 16_800, 0.5);
      near(s.years[1].ca, 23_520, 0.5);
      near(s.years[2].ca, 32_928, 0.5);
    }
  });

  it('Scenario A (as is) : EBITDA -5 110 / -11 441,5 / -23 521,2', () => {
    near(res.asIs.years[0].ebitda, -5_110, 0.5);
    near(res.asIs.years[1].ebitda, -11_441.5, 0.5);
    near(res.asIs.years[2].ebitda, -23_521.2, 0.5);
  });

  it('Scenario A : tresorerie de cloture 1 120 / -10 321,5 / -33 842,7 ; epuisement ~14,6 mois', () => {
    near(res.asIs.years[0].closingCash, 1_120, 0.5);
    near(res.asIs.years[1].closingCash, -10_321.5, 0.5);
    near(res.asIs.years[2].closingCash, -33_842.7, 0.5);
    expect(res.asIs.depletionMonths).not.toBeNull();
    near(res.asIs.depletionMonths!, 14.6, 0.1);
  });

  it('Scenario B (rebound) : EBITDA +140 / +2 996 / +6 994,4 ; marge +0,8 / +12,7 / +21,2 %', () => {
    near(res.rebound.years[0].ebitda, 140, 0.5);
    near(res.rebound.years[1].ebitda, 2_996, 0.5);
    near(res.rebound.years[2].ebitda, 6_994.4, 0.5);
    near(res.rebound.years[0].ebitdaMarginPct * 100, 0.8, 0.1);
    near(res.rebound.years[1].ebitdaMarginPct * 100, 12.7, 0.1);
    near(res.rebound.years[2].ebitdaMarginPct * 100, 21.2, 0.1);
  });

  it('Scenario B : tresorerie de cloture 6 370 / 9 366 / 16 360,4, jamais sous l ouverture', () => {
    near(res.rebound.years[0].closingCash, 6_370, 0.5);
    near(res.rebound.years[1].closingCash, 9_366, 0.5);
    near(res.rebound.years[2].closingCash, 16_360.4, 0.5);
    for (const y of res.rebound.years) expect(y.closingCash).toBeGreaterThanOrEqual(A.openingCash);
    expect(res.rebound.depletionMonths).toBeNull();
  });

  it('Rule of 40 : A 9,6 / -8,6 / -31,4 ; B 40,8 / 52,7 / 61,2', () => {
    near(res.asIs.years[0].ruleOf40, 9.6, 0.1);
    near(res.asIs.years[1].ruleOf40, -8.6, 0.1);
    near(res.asIs.years[2].ruleOf40, -31.4, 0.1);
    near(res.rebound.years[0].ruleOf40, 40.8, 0.1);
    near(res.rebound.years[1].ruleOf40, 52.7, 0.1);
    near(res.rebound.years[2].ruleOf40, 61.2, 0.1);
  });

  it('Effort CAC (B) : ajouts nets ~9 106, churnes ~4 333, bruts ~13 439, CAC equivalent ~521 €', () => {
    near(res.cacEffort.netAdds, 9_106, 1);
    near(res.cacEffort.churned, 4_333, 1);
    near(res.cacEffort.gross, 13_439, 1);
    near(res.cacEffort.cacEquivalent, 521, 1);
  });

  it('dotations 110 / 120 / 130 et EBIT = EBITDA - dotations', () => {
    expect(res.asIs.years.map((y) => y.da)).toEqual([110, 120, 130]);
    for (const y of res.rebound.years) near(y.ebit, y.ebitda - y.da, 0.001);
  });
});
