import { describe, expect, it } from 'vitest';
import { consolidate } from '../consolidate';
import type { ConsolidationInputs, QuarterValues } from '../types';

/**
 * Objectif de churn saisi en navette (kind churn_rate) : niveau trimestriel en % par mois.
 * S'il existe, il fait foi ; sinon repli sur le taux de la config. Une seule ligne par societe.
 */
function base(churnLine?: QuarterValues): ConsolidationInputs {
  return {
    config: {
      name: 'C',
      budgetYear: 2027,
      openingCash: 1_000_000,
      openingMrr: 500_000,
      arpa: 40,
      grossMarginPct: 0.7,
      monthlyChurnPct: 0.02, // 2 %/mois
      runwayVigilanceMonths: 18,
      runwayFreezeMonths: 12,
    },
    departments: [{ id: 'sales', code: 'S', name: 'Sales', envelope: null, isSalesMarketing: true }],
    channels: [],
    driverDefs: [
      { id: 'mrr', departmentId: 'sales', code: 'MRR', label: 'New MRR', kind: 'new_mrr' },
      ...(churnLine ? [{ id: 'churn', departmentId: 'sales', code: 'CHURN', label: 'Churn', kind: 'churn_rate' as const }] : []),
    ],
    submissions: [
      {
        departmentId: 'sales',
        version: 1,
        status: 'submitted',
        lines: [
          { driverDefId: 'mrr', q: [30_000, 30_000, 30_000, 30_000] },
          ...(churnLine ? [{ driverDefId: 'churn', q: churnLine }] : []),
        ],
      },
    ],
  };
}

describe('churn_rate : objectif de churn en navette', () => {
  it('churn constant a 2 % en navette = repli config, a l euro pres', () => {
    const cfg = consolidate(base());
    const line = consolidate(base([2, 2, 2, 2]));
    expect(line.ok).toBe(true);
    for (let m = 0; m < 12; m++) {
      expect(line.months[m].mrrEnd).toBeCloseTo(cfg.months[m].mrrEnd, 2);
      expect(line.months[m].revenue).toBeCloseTo(cfg.months[m].revenue, 2);
    }
  });

  it('churn decroissant => MRR de decembre superieur au churn constant', () => {
    const constant = consolidate(base([2, 2, 2, 2]));
    const decreasing = consolidate(base([2, 1.5, 1, 0.5]));
    expect(decreasing.months[11].mrrEnd).toBeGreaterThan(constant.months[11].mrrEnd);
  });

  it('plus d une ligne churn_rate dans la societe = controle bloquant', () => {
    const inputs = base([2, 2, 2, 2]);
    inputs.departments.push({ id: 'ops', code: 'O', name: 'Ops', envelope: null, isSalesMarketing: false });
    inputs.driverDefs.push({ id: 'churn2', departmentId: 'ops', code: 'CH2', label: 'Churn 2', kind: 'churn_rate' });
    inputs.submissions.push({ departmentId: 'ops', version: 1, status: 'submitted', lines: [{ driverDefId: 'churn2', q: [1, 1, 1, 1] }] });
    const r = consolidate(inputs);
    expect(r.ok).toBe(false);
    expect(r.blocking.some((a) => a.code === 'CHURN_RATE_DOUBLON')).toBe(true);
  });

  it('churn hors bornes (>= 100) = controle bloquant', () => {
    const r = consolidate(base([2, 2, 120, 2]));
    expect(r.ok).toBe(false);
    expect(r.blocking.some((a) => a.code === 'CHURN_RATE_HORS_BORNES')).toBe(true);
  });
});
