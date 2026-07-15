import { describe, expect, it } from 'vitest';
import { consolidate } from '../consolidate';
import { simulateRound, type SimulatedDept } from '../simulate-round';
import { isInlineLine, type Submission, type SubmissionLine } from '../types';
import { FINCOPILOT, HEXAFLOOR, seedToEngineInputs } from '../../seed-data';

/**
 * La simulation de round doit produire, pour n'importe quelle configuration, un budget
 * complet qui CONSOLIDE (aucun controle bloquant) et qui tient dans les grandes masses :
 * revenu reconduit avec croissance, COGS au taux de marge, couts proches des enveloppes.
 */

/** Transforme la sortie de la simulation en soumissions consolidables. */
function toSubmissions(depts: SimulatedDept[]): Submission[] {
  return depts.map((d) => {
    const lines: SubmissionLine[] = [
      ...d.driverLines.map((l) => ({ driverDefId: l.driverDefId, q: l.q, unitCost: l.unitCost })),
      ...d.customLines.map((c, i) => ({
        id: `${d.departmentId}-sim-${i}`,
        kind: c.kind,
        label: c.label,
        frequency: c.frequency,
        q: c.q,
        isNew: c.isNew,
      })),
    ];
    return { departmentId: d.departmentId, version: 1, status: 'submitted' as const, lines };
  });
}

describe('simulateRound : FinCopilot, reconduction du realise N-1', () => {
  const base = seedToEngineInputs(FINCOPILOT);
  const PREV_REVENUE = 12_000_000;
  const sim = simulateRound({
    config: base.config,
    departments: base.departments,
    driverDefs: base.driverDefs,
    channels: base.channels,
    prevYearRevenue: PREV_REVENUE,
    cacAvgTarget: FINCOPILOT.cacAvgTarget,
  });
  const res = consolidate({ ...base, submissions: toSubmissions(sim.departments) });

  it('produit un budget consolidable : aucun controle bloquant', () => {
    expect(res.ok).toBe(true);
    expect(res.blocking).toHaveLength(0);
  });

  it('cible un revenu reconduit avec +40 % de croissance', () => {
    expect(sim.targetRevenue).toBeCloseTo(PREV_REVENUE * 1.4, 0);
    // Le revenu consolide reste dans les grandes masses de la cible (roll-forward + arrondis).
    const ecart = Math.abs(res.totals!.revenue - sim.targetRevenue) / sim.targetRevenue;
    expect(ecart).toBeLessThan(0.12);
  });

  it('cale les COGS sur le taux de marge de la config (marge 70 % => COGS ~30 %)', () => {
    const cogsRatio = res.totals!.cogsAnnual / res.totals!.revenue;
    expect(cogsRatio).toBeGreaterThan(0.24);
    expect(cogsRatio).toBeLessThan(0.36);
    expect(res.totals!.effectiveGrossMarginPct!).toBeGreaterThan(0.6);
    expect(res.totals!.effectiveGrossMarginPct!).toBeLessThan(0.78);
  });

  it('remplit chaque fonction vers son enveloppe de cadrage', () => {
    for (const d of res.departments) {
      const dept = base.departments.find((x) => x.id === d.departmentId)!;
      if (dept.envelope == null) continue;
      expect(d.annualCost).toBeGreaterThan(dept.envelope * 0.7);
      expect(d.annualCost).toBeLessThan(dept.envelope * 1.15);
    }
  });

  it('degage un EBITDA coherent (positif dans ce scenario de reconduction)', () => {
    expect(Number.isFinite(res.totals!.ebitda)).toBe(true);
    expect(res.totals!.ebitda).toBeGreaterThan(0);
  });

  it('garde les canaux dans leur plafond de CAC (CAC cible a 90 % du plafond)', () => {
    const horsPlafond = res.warnings.filter((w) => w.code === 'CAC_PLAFOND');
    expect(horsPlafond).toHaveLength(0);
  });

  it('nomme les lignes libres generees quand un departement n a pas de driver de cout', () => {
    // Sales n'a que des drivers de topline : sa masse salariale sort en ligne libre.
    const sales = sim.departments.find((d) => d.departmentId === 'fc-sales')!;
    expect(sales.customLines.some((c) => c.kind === 'payroll')).toBe(true);
    expect(sales.customLines.every((c) => c.label.trim() !== '')).toBe(true);
  });
});

describe('simulateRound : Hexafloor, sans historique N-1', () => {
  const base = seedToEngineInputs(HEXAFLOOR);
  const sim = simulateRound({
    config: base.config,
    departments: base.departments,
    driverDefs: base.driverDefs,
    channels: base.channels,
    prevYearRevenue: null, // aucun realise : la base est le MRR d'ouverture x 12
    cacAvgTarget: HEXAFLOOR.cacAvgTarget,
  });
  const res = consolidate({ ...base, submissions: toSubmissions(sim.departments) });

  it('produit un budget consolidable meme sans revenu N-1', () => {
    expect(res.ok).toBe(true);
    expect(res.blocking).toHaveLength(0);
    expect(sim.targetRevenue).toBeCloseTo(HEXAFLOOR.config.openingMrr * 12 * 1.4, 0);
  });

  it('ne place aucune valeur negative dans les navettes', () => {
    for (const s of toSubmissions(sim.departments)) {
      for (const l of s.lines) {
        for (const v of l.q) expect(v).toBeGreaterThanOrEqual(0);
        if (!isInlineLine(l) && l.unitCost !== undefined) expect(l.unitCost).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
