import { describe, expect, it } from 'vitest';
import { monthlyizeByFrequency, sum } from '../monthlyize';
import { consolidate } from '../consolidate';
import type { ConsolidationInputs, LineFrequency, QuarterValues } from '../types';

/**
 * Fréquence de décaissement et capex.
 * Propriété centrale : quelle que soit la fréquence, la somme des 12 mois
 * est toujours égale à la somme des 4 trimestres.
 */

const FREQUENCIES: LineFrequency[] = ['mensuel', 'trimestriel', 'one_shot'];

describe('monthlyizeByFrequency : repartition sur 12 mois', () => {
  const q: QuarterValues = [300, 600, 900, 1200];

  it.each(FREQUENCIES)('la somme des 12 mois egale la somme des trimestres (%s)', (frequency) => {
    const months = monthlyizeByFrequency(q, frequency);
    expect(months.length).toBe(12);
    expect(sum(months)).toBeCloseTo(sum(q), 6);
  });

  it('mensuel : un tiers du trimestre par mois', () => {
    expect(monthlyizeByFrequency(q, 'mensuel')).toEqual([
      100, 100, 100, 200, 200, 200, 300, 300, 300, 400, 400, 400,
    ]);
  });

  it('trimestriel : 100 % au dernier mois du trimestre', () => {
    expect(monthlyizeByFrequency(q, 'trimestriel')).toEqual([
      0, 0, 300, 0, 0, 600, 0, 0, 900, 0, 0, 1200,
    ]);
  });

  it('one_shot : 100 % au premier mois du trimestre saisi', () => {
    expect(monthlyizeByFrequency([0, 500, 0, 0], 'one_shot')).toEqual([
      0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('consolidate : traitement du capex', () => {
  const base = (extraLines: { driverDefId: string; q: QuarterValues }[] = []): ConsolidationInputs => ({
    config: {
      name: 'T', budgetYear: 2027, openingCash: 1_000_000, openingMrr: 100_000, arpa: 100,
      grossMarginPct: 0.7, monthlyChurnPct: 0, runwayVigilanceMonths: 18, runwayFreezeMonths: 12,
    },
    departments: [{ id: 'd1', code: 'D1', name: 'Dept', envelope: 1_000_000, isSalesMarketing: false }],
    channels: [],
    driverDefs: [
      { id: 'p1', departmentId: 'd1', code: 'P1', label: 'Salaires', kind: 'payroll' },
      { id: 'cx', departmentId: 'd1', code: 'CX', label: 'Investissement', kind: 'capex' },
    ],
    submissions: [
      {
        departmentId: 'd1',
        version: 1,
        status: 'submitted',
        lines: [{ driverDefId: 'p1', q: [30_000, 30_000, 30_000, 30_000] }, ...extraLines],
      },
    ],
  });

  const sansCapex = consolidate(base());
  const avecCapex = consolidate(base([{ driverDefId: 'cx', q: [120_000, 0, 0, 0] }]));

  it('consolide sans controle bloquant', () => {
    expect(sansCapex.ok).toBe(true);
    expect(avecCapex.ok).toBe(true);
  });

  it('le capex ne pese ni sur l EBITDA ni sur la marge de contribution', () => {
    expect(avecCapex.totals!.ebitda).toBeCloseTo(sansCapex.totals!.ebitda, 6);
    for (let m = 0; m < 12; m++) {
      expect(avecCapex.months[m].contributionMargin).toBeCloseTo(sansCapex.months[m].contributionMargin, 6);
    }
  });

  it('le capex se deduit de la tresorerie', () => {
    expect(sum(avecCapex.months.map((r) => r.capexTotal))).toBeCloseTo(120_000, 6);
    expect(avecCapex.totals!.endCash).toBeCloseTo(sansCapex.totals!.endCash - 120_000, 6);
  });

  it('le capex compte dans l enveloppe du departement', () => {
    const sans = sansCapex.departments.find((d) => d.departmentId === 'd1')!;
    const avec = avecCapex.departments.find((d) => d.departmentId === 'd1')!;
    expect(avec.annualCost).toBeCloseTo(sans.annualCost + 120_000, 6);
  });

  it('sans aucune ligne capex, capexTotal est nul chaque mois', () => {
    expect(sansCapex.months.every((r) => r.capexTotal === 0)).toBe(true);
  });
});
