import { describe, expect, it } from 'vitest';
import { consolidate, fillScenario, type ScenarioAssumptions, type ScenarioHistoryYearN, type Submission } from '../index';
import type { SimulatedDept } from '../simulate-round';
import { FINCOPILOT, FINCOPILOT_SIMULATION, seedToEngineInputs } from '../../seed-data';

/**
 * Pipeline complet : remplissage des navettes selon un scenario -> consolidation.
 * Les ancres sont celles du memoire Section 2 (FinCopilot). Si un test ne colle pas, on
 * corrige le code ou la calibration, jamais l'ancre. Tolerances : 20 K€ sur les montants,
 * 150 clients, quelques euros sur le CAC moyen.
 */

const N: ScenarioHistoryYearN = { ca: 12_000, sm: 7_000, structure: 3_300 };
const A: ScenarioAssumptions = {
  growth: FINCOPILOT_SIMULATION.growth,
  grossMarginPct: FINCOPILOT_SIMULATION.grossMarginPct,
  smGrowth: FINCOPILOT_SIMULATION.smGrowth,
  smFrozenAmount: FINCOPILOT_SIMULATION.smFrozenAmount,
  daBase: FINCOPILOT_SIMULATION.daBase,
  daStep: FINCOPILOT_SIMULATION.daStep,
  openingCash: FINCOPILOT_SIMULATION.openingCash,
  arrEndN: FINCOPILOT_SIMULATION.arrEndN,
  arpaMonthly: FINCOPILOT_SIMULATION.arpaMonthly,
  monthlyChurn: FINCOPILOT_SIMULATION.monthlyChurn,
  baseClientsEndN: FINCOPILOT_SIMULATION.baseClientsEndN,
};
const TRAJ = FINCOPILOT_SIMULATION.cacTrajectory;

const base = seedToEngineInputs(FINCOPILOT);

/** Aplatit un departement rempli au format navette soumise du moteur. */
const toSub = (d: SimulatedDept): Submission => ({
  departmentId: d.departmentId,
  version: 99,
  status: 'submitted',
  lines: [
    ...d.driverLines.map((l) => ({ driverDefId: l.driverDefId, q: l.q, unitCost: l.unitCost })),
    ...d.customLines.map((c, i) => ({ id: `${d.departmentId}-fill-${i}`, kind: c.kind, label: c.label, frequency: c.frequency, q: c.q, isNew: c.isNew })),
  ],
});

function consolidateScenario(mode: 'asIs' | 'rebound') {
  const fill = fillScenario({
    mode,
    config: base.config,
    departments: base.departments,
    driverDefs: base.driverDefs,
    channels: base.channels,
    history: N,
    assumptions: A,
    cacTrajectory: TRAJ,
  });
  const res = consolidate({ ...base, submissions: fill.departments.map(toSub) });
  return { fill, res };
}

const near = (actual: number, expected: number, tol: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe('fillScenario -> consolidate : ancres du memoire Section 2', () => {
  const asIs = consolidateScenario('asIs');
  const rebound = consolidateScenario('rebound');

  // S&M consolide = somme des couts (sgna) des departements S&M. Ici tout le S&M passe par les
  // depenses canaux de Growth ; Sales ne porte que le revenu non recurrent.
  const smOf = (res: ReturnType<typeof consolidate>) => {
    const smMonthly = res.months.map((m) => m.smSpend);
    return smMonthly.reduce((a, b) => a + b, 0);
  };

  it('les deux scenarios consolident sans controle bloquant', () => {
    expect(asIs.res.ok).toBe(true);
    expect(rebound.res.ok).toBe(true);
  });

  it('CA 2027 consolide = 16 800 K€ dans les deux scenarios', () => {
    near(asIs.res.totals!.revenue, 16_800_000, 20_000);
    near(rebound.res.totals!.revenue, 16_800_000, 20_000);
  });

  it('rebound : EBITDA +140 K€, S&M 7 000 K€ exact', () => {
    near(rebound.res.totals!.ebitda, 140_000, 20_000);
    near(smOf(rebound.res), 7_000_000, 1_000);
  });

  it('as is : EBITDA -5 110 K€, S&M 12 250 K€ exact', () => {
    near(asIs.res.totals!.ebitda, -5_110_000, 20_000);
    near(smOf(asIs.res), 12_250_000, 1_000);
  });

  it('rebound : CAC moyen ~520 €, nouveaux clients bruts ~13 400', () => {
    near(rebound.res.totals!.blendedCac!, 520, 8);
    const customers = rebound.res.channelQuarters.reduce((a, c) => a + c.newCustomers, 0);
    near(customers, 13_400, 150);
  });

  it('as is : alertes d enveloppe ET de CAC presentes (attendu pour la demonstration)', () => {
    const codes = asIs.res.warnings.map((w) => w.code);
    expect(codes).toContain('ENVELOPPE_DEPASSEE');
    expect(codes).toContain('CAC_PLAFOND');
  });

  it('rebound : aucune alerte d enveloppe sur les departements de structure', () => {
    const structureOverruns = rebound.res.warnings.filter(
      (w) => w.code === 'ENVELOPPE_DEPASSEE' && ['fc-tech', 'fc-ops', 'fc-fap'].includes(w.departmentId ?? ''),
    );
    expect(structureOverruns).toEqual([]);
  });
});
