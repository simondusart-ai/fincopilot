import { describe, expect, it } from 'vitest';
import { applyBusinessCases, businessCaseLines, computeBusinessCase, type AcceptedBusinessCase } from '../business-case';
import { consolidate } from '../consolidate';
import type { ConsolidationInputs } from '../types';

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

describe('applyBusinessCases : injection des cas acceptes dans la consolidation', () => {
  const baseInputs: ConsolidationInputs = {
    config: {
      name: 'T', budgetYear: 2027, openingCash: 1_000_000, openingMrr: 0, arpa: 100,
      grossMarginPct: 0.7, monthlyChurnPct: 0, runwayVigilanceMonths: 18, runwayFreezeMonths: 12,
    },
    departments: [{ id: 'd1', code: 'D1', name: 'Dept', envelope: null, isSalesMarketing: false }],
    channels: [],
    driverDefs: [{ id: 'p1', departmentId: 'd1', code: 'P1', label: 'Salaires', kind: 'payroll' }],
    submissions: [{ departmentId: 'd1', version: 1, status: 'submitted', lines: [{ driverDefId: 'p1', q: [100_000, 100_000, 100_000, 100_000] }] }],
  };
  const bc: AcceptedBusinessCase = {
    id: 'bc1',
    label: 'Projet X',
    targetDepartmentId: 'd1',
    // salaires annee 1 = 1 x 10 000 x 12 = 120 000 ; opex = 20 000
    params: { label: 'Projet X', horizonYears: 1, discountRate: 0.15, years: [{ revenue: 0, recurringCosts: 0, fte: 1, monthlyCostPerFte: 10_000, otherOpex: 20_000 }] },
  };

  it('ajoute des lignes libres sur le departement cible, sans creer de driver synthetique', () => {
    const applied = applyBusinessCases(baseInputs, [bc]);
    // Le referentiel reste intact : une seule source de verite, aucun driver invente.
    expect(applied.driverDefs).toEqual(baseInputs.driverDefs);
    const sub = applied.submissions.find((s) => s.departmentId === 'd1')!;
    expect(sub.lines.length).toBe(3); // 1 ligne de referentiel + salaires + opex
    // n'altere pas les entrees d'origine
    expect(baseInputs.submissions[0].lines.length).toBe(1);
  });

  it('les lignes portent le tag business case et le bon type', () => {
    const lines = businessCaseLines(bc);
    expect(lines.map((l) => l.kind)).toEqual(['payroll', 'opex']);
    expect(lines.every((l) => l.label.startsWith('Business case : Projet X'))).toBe(true);
  });

  it('consolidation avec le business case = consolidation sans, plus ses montants, au centime pres', () => {
    const sans = consolidate(baseInputs);
    const avec = consolidate(applyBusinessCases(baseInputs, [bc]));
    expect(avec.ok).toBe(true);
    const dSans = sans.departments.find((x) => x.departmentId === 'd1')!;
    const dAvec = avec.departments.find((x) => x.departmentId === 'd1')!;
    // salaires 120 000 + opex 20 000
    expect(dAvec.annualCost).toBeCloseTo(dSans.annualCost + 140_000, 2);
    expect(avec.totals!.ebitda).toBeCloseTo(sans.totals!.ebitda - 140_000, 2);
    expect(avec.totals!.endCash).toBeCloseTo(sans.totals!.endCash - 140_000, 2);
  });

  it('un invest one-off devient une ligne capex : hors EBITDA, mais deduite de la tresorerie', () => {
    const withInvest: AcceptedBusinessCase = {
      ...bc,
      params: { ...bc.params, years: [{ ...bc.params.years[0], investment: 40_000 }] },
    };
    const sans = consolidate(baseInputs);
    const avec = consolidate(applyBusinessCases(baseInputs, [withInvest]));
    const lines = businessCaseLines(withInvest);
    expect(lines.map((l) => l.kind)).toEqual(['payroll', 'opex', 'capex']);
    // Le capex ne pese pas sur l EBITDA...
    expect(avec.totals!.ebitda).toBeCloseTo(sans.totals!.ebitda - 140_000, 2);
    // ...mais il se deduit de la tresorerie et compte dans l enveloppe.
    expect(avec.totals!.endCash).toBeCloseTo(sans.totals!.endCash - 180_000, 2);
    const d = avec.departments.find((x) => x.departmentId === 'd1')!;
    const dSans = sans.departments.find((x) => x.departmentId === 'd1')!;
    expect(d.annualCost).toBeCloseTo(dSans.annualCost + 180_000, 2);
  });

  it('aucun doublon : injecter le meme cas deux fois ne le compte pas deux fois par accident', () => {
    // Un cas accepte n'apparait qu'une fois dans la liste : on verifie que l injection
    // est bien additive et deterministe (deux appels successifs partent des memes entrees).
    const a = consolidate(applyBusinessCases(baseInputs, [bc]));
    const b = consolidate(applyBusinessCases(baseInputs, [bc]));
    expect(a.totals!.ebitda).toBeCloseTo(b.totals!.ebitda, 2);
    const sub = applyBusinessCases(baseInputs, [bc]).submissions.find((s) => s.departmentId === 'd1')!;
    const ids = sub.lines.filter((l) => 'id' in l).map((l) => (l as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sans departement cible correspondant, les entrees sont inchangees', () => {
    const applied = applyBusinessCases(baseInputs, [{ ...bc, targetDepartmentId: 'inconnu' }]);
    expect(applied.submissions[0].lines.length).toBe(baseInputs.submissions[0].lines.length);
  });
});
