import { describe, expect, it } from 'vitest';
import { budgetAnnualPnl, realizedAnnualPnl } from '../pnl-annual';

describe('realizedAnnualPnl : rebouclage Annexe A (FinCopilot 2026)', () => {
  it('marge brute 8 400 K, contribution 1 400 K, structure 3 300 K, EBITDA -1 900 K', () => {
    // Annexe A 2026 : CA 12 000, S&M 7 000, tech 2 500, masse salariale 3 500, G&A 900.
    const p = realizedAnnualPnl(
      { revenue: 12_000_000, sm: 7_000_000, techProduct: 2_500_000, payrollOther: 3_500_000, ga: 900_000 },
      0.3,
    );
    expect(p.cogs).toBeCloseTo(3_600_000, 2);
    expect(p.grossMargin).toBeCloseTo(8_400_000, 2);
    expect(p.contribution).toBeCloseTo(1_400_000, 2);
    expect(p.structure).toBeCloseTo(3_300_000, 2);
    expect(p.ebitda).toBeCloseTo(-1_900_000, 2);
  });
});

describe('budgetAnnualPnl : reconciliation contribution - structure = EBITDA', () => {
  it('EBITDA = marge de contribution - couts de structure', () => {
    const p = budgetAnnualPnl(
      { revenue: 16_800_000, cogsAnnual: 5_040_000, grossMargin: 11_760_000, ebitda: 1_030_000 },
      6_650_000, // S&M
      10_730_000, // salaires + opex de tous les departements
    );
    expect(p.contribution).toBeCloseTo(p.grossMargin - 6_650_000, 2);
    expect(p.structure).toBeCloseTo(10_730_000 - 6_650_000, 2);
    expect(p.contribution - p.structure).toBeCloseTo(p.ebitda, 2);
  });
});
