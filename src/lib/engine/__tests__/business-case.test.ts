import { describe, expect, it } from 'vitest';
import { computeBusinessCase } from '../business-case';

/**
 * Tests du moteur de business case.
 * Ancre : projet CGP du skill test en lecture defavorable (jamais rentable sur l'horizon).
 */

describe('computeBusinessCase : projet CGP (lecture defavorable)', () => {
  const res = computeBusinessCase({
    label: 'CGP',
    horizonYears: 3,
    discountRate: 0.15,
    years: [
      { revenue: 200_000, recurringCosts: 800_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 0, investment: 25_000 },
      { revenue: 600_000, recurringCosts: 1_600_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 0 },
      { revenue: 1_200_000, recurringCosts: 3_200_000, fte: 1.5, monthlyCostPerFte: 12_500, otherOpex: 0 },
    ],
  });

  it('salaires = ETP x cout x 12 = 225 000 EUR par an', () => {
    expect(res.years.map((y) => y.salaries)).toEqual([225_000, 225_000, 225_000]);
  });

  it('cash-flows -850 / -1225 / -2225 K et cumul -4300 K', () => {
    expect(res.years.map((y) => y.cashFlow)).toEqual([-850_000, -1_225_000, -2_225_000]);
    expect(res.totalCashFlow).toBe(-4_300_000);
  });

  it('payback null : le cumul ne devient jamais positif', () => {
    expect(res.paybackMonths).toBeNull();
  });

  it('VAN negative (projet destructeur de valeur au taux retenu)', () => {
    expect(res.npv).toBeLessThan(0);
  });
});

describe('computeBusinessCase : VAN verifiee a la main', () => {
  it('CF 110 puis 121, taux 10 % : VAN = 110/1,1 + 121/1,21 = 200', () => {
    const res = computeBusinessCase({
      label: 'simple',
      horizonYears: 2,
      discountRate: 0.1,
      years: [
        { revenue: 110, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
        { revenue: 121, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
      ],
    });
    expect(res.years.map((y) => y.cashFlow)).toEqual([110, 121]);
    expect(res.npv).toBeCloseTo(200, 6);
  });
});

describe('computeBusinessCase : payback par interpolation lineaire', () => {
  it('CF -100 puis +200 : cumul positif a mi-annee 2, payback = 18 mois', () => {
    const res = computeBusinessCase({
      label: 'pb',
      horizonYears: 2,
      discountRate: 0.1,
      years: [
        { revenue: 0, recurringCosts: 100, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
        { revenue: 200, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
      ],
    });
    expect(res.years.map((y) => y.cashFlow)).toEqual([-100, 200]);
    expect(res.paybackMonths).toBeCloseTo(18, 6);
  });
});

describe('computeBusinessCase : valeurs par defaut', () => {
  it('horizon 3 et taux 0,15 quand ils ne sont pas fournis', () => {
    const res = computeBusinessCase({
      label: 'defaut',
      years: [
        { revenue: 1, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
        { revenue: 1, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
        { revenue: 1, recurringCosts: 0, fte: 0, monthlyCostPerFte: 0, otherOpex: 0 },
      ],
    });
    expect(res.horizonYears).toBe(3);
    expect(res.discountRate).toBe(0.15);
    expect(res.years.length).toBe(3);
  });

  it('horizon borne a [1, 5]', () => {
    const res = computeBusinessCase({ label: 'clamp', horizonYears: 9, years: [] });
    expect(res.horizonYears).toBe(5);
    expect(res.years.length).toBe(5);
  });
});
