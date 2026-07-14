import { describe, expect, it } from 'vitest';
import { projectBaseline, reconductedFixedCosts, type BaselineParams } from '../baseline';

/**
 * Scenario de reconduction : ce qui se passe si on ne fait rien.
 * Ancre sur l'Annexe A de FinCopilot (annee N = 2026) : revenu 12 000 K,
 * couts totaux 13 900 K (S&M 7 000 + Tech 2 500 + masse salariale 3 500 + G&A 900),
 * donc EBITDA -1 900 K.
 */

const PREV_REVENUE = 12_000_000;
const PREV_COSTS = 7_000_000 + 2_500_000 + 3_500_000 + 900_000; // 13 900 000
const PREV_EBITDA = PREV_REVENUE - PREV_COSTS; // -1 900 000

describe('reconductedFixedCosts : calibration du socle fixe', () => {
  it('retranche les couts variables impliques par le taux de marge', () => {
    const fixed = reconductedFixedCosts({
      prevYearRevenue: PREV_REVENUE,
      prevYearTotalCosts: PREV_COSTS,
      grossMarginPct: 0.7,
    });
    // 13 900 000 - 30 % x 12 000 000 = 10 300 000
    expect(fixed).toBeCloseTo(10_300_000, 2);
  });
});

describe('projectBaseline : le modele reproduit l EBITDA de N-1', () => {
  /**
   * Test de calibration : sans churn et avec un MRR tel que le revenu annuel egale
   * celui de N-1, l'EBITDA projete DOIT retomber sur celui de N-1. Sans cette
   * propriete, reconduire les couts tout en appliquant une marge brute compterait
   * deux fois les couts variables.
   */
  it('a churn nul et revenu identique a N-1, l EBITDA projete egale celui de N-1', () => {
    const res = projectBaseline({
      openingMrr: PREV_REVENUE / 12, // 1 000 000 par mois => 12 000 000 sur l'annee
      monthlyChurnPct: 0,
      grossMarginPct: 0.7,
      openingCash: 6_230_000,
      prevYearRevenue: PREV_REVENUE,
      prevYearTotalCosts: PREV_COSTS,
    });
    expect(res.totals.revenue).toBeCloseTo(PREV_REVENUE, 2);
    expect(res.totals.ebitda).toBeCloseTo(PREV_EBITDA, 2);
  });
});

describe('projectBaseline : ancre FinCopilot (ne rien faire degrade tout)', () => {
  const params: BaselineParams = {
    openingMrr: 933_000,
    monthlyChurnPct: 0.013,
    grossMarginPct: 0.7,
    openingCash: 6_230_000,
    prevYearRevenue: PREV_REVENUE,
    prevYearTotalCosts: PREV_COSTS,
  };
  const res = projectBaseline(params);

  it('le MRR s erode du churn, mois apres mois, sans aucun nouveau client', () => {
    expect(res.months[0].mrrEnd).toBeCloseTo(933_000 * (1 - 0.013), 6);
    expect(res.months[1].mrrEnd).toBeCloseTo(933_000 * (1 - 0.013) ** 2, 6);
    // Au bout de douze mois, il ne reste que (1 - churn)^12 du MRR de depart.
    expect(res.totals.mrrEnd).toBeCloseTo(933_000 * (1 - 0.013) ** 12, 4);
    // La topline ne fait que baisser.
    for (let m = 1; m < 12; m++) {
      expect(res.months[m].mrrEnd).toBeLessThan(res.months[m - 1].mrrEnd);
    }
  });

  it('le socle fixe est reparti lineairement et sa somme fait l annuel', () => {
    const total = res.months.reduce((a, r) => a + r.fixedCosts, 0);
    expect(total).toBeCloseTo(res.annualFixedCosts, 2);
    expect(res.annualFixedCosts).toBeCloseTo(10_300_000, 2);
  });

  it('chaque mois : EBITDA = marge brute moins le socle fixe', () => {
    for (const m of res.months) {
      expect(m.ebitda).toBeCloseTo(m.grossMargin - m.fixedCosts, 6);
      expect(m.grossMargin).toBeCloseTo(m.revenue * 0.7, 6);
    }
  });

  it('ne rien faire degrade l EBITDA sous celui de N-1 : c est le cout de l inaction', () => {
    expect(res.totals.ebitda).toBeLessThan(PREV_EBITDA);
  });

  it('la tresorerie est le cumul de l EBITDA sur celle d ouverture, et elle fond', () => {
    expect(res.months[11].cash).toBeCloseTo(6_230_000 + res.totals.ebitda, 2);
    expect(res.totals.endCash).toBeLessThan(6_230_000);
  });

  it('le runway est calculable et se degrade', () => {
    expect(res.totals.minRunway).not.toBeNull();
    expect(res.totals.minRunway!).toBeGreaterThan(0);
  });
});
