import { describe, expect, it } from 'vitest';
import { consolidate, diffSubmissions } from '../index';
import { FINCOPILOT, HEXAFLOOR, seedToEngineInputs } from '../../seed-data';

/**
 * Tests de cohérence du jeu de démonstration.
 * Ils verrouillent le rebouclage avec les Sections 1 et 2 du skill test :
 * si un chiffre de seed bouge, ces tests disent immédiatement si l'histoire tient toujours.
 */

describe('seed FinCopilot : rebouclage avec le scénario rebound', () => {
  const inputs = seedToEngineInputs(FINCOPILOT);
  const res = consolidate(inputs);

  it('consolide sans contrôle bloquant', () => {
    expect(res.blocking).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('CA N+1 autour de +40 % vs N (12 000 K€)', () => {
    const growth = res.totals!.revenue / 12_000_000 - 1;
    expect(growth).toBeGreaterThan(0.35);
    expect(growth).toBeLessThan(0.48);
  });

  it('EBITDA annuel positif : breakeven atteint dès N+1', () => {
    expect(res.totals!.ebitda).toBeGreaterThan(0);
    expect(res.totals!.ebitda).toBeLessThan(2_500_000);
  });

  it('marge brute effective proche de la convention de 70 %', () => {
    expect(res.totals!.effectiveGrossMarginPct!).toBeGreaterThan(0.65);
    expect(res.totals!.effectiveGrossMarginPct!).toBeLessThan(0.73);
  });

  it('CAC moyen sous le plafond de 515 €, payback brut sous 18 mois', () => {
    expect(res.totals!.blendedCac!).toBeLessThan(515);
    expect(res.totals!.grossPaybackMonths!).toBeLessThan(18);
  });

  it('le SEA reste au-dessus du plafond au S1 (alertes attendues), conforme à la cible "CAC < 515 € fin T2"', () => {
    const seaAlerts = res.warnings.filter((w) => w.code === 'CAC_PLAFOND' && w.channelId === 'fc-sea');
    expect(seaAlerts.map((w) => w.quarter)).toEqual([1, 2]);
  });

  it('S&M total sous le gel de 7 000 K€', () => {
    const sm = res.departments
      .filter((d) => ['fc-sales', 'fc-growth'].includes(d.departmentId))
      .reduce((a, d) => a + d.annualCost, 0);
    expect(sm).toBeLessThanOrEqual(7_000_000);
  });

  it('aucune alerte runway ni trésorerie : le budget est finançable', () => {
    const codes = res.warnings.map((w) => w.code);
    expect(codes).not.toContain('RUNWAY_GEL');
    expect(codes).not.toContain('RUNWAY_VIGILANCE');
    expect(codes).not.toContain('TRESORERIE_NEGATIVE');
    expect(res.totals!.endCash).toBeGreaterThan(FINCOPILOT.config.openingCash);
  });

  it('aucune enveloppe dépassée dans les versions retenues (v2 Growth)', () => {
    expect(res.warnings.filter((w) => w.code === 'ENVELOPPE_DEPASSEE')).toEqual([]);
  });

  it('le diff Growth v1 vers v2 rend du cash et de l’EBITDA', () => {
    const defs = inputs.driverDefs;
    const v1 = FINCOPILOT.submissions.find((s) => s.departmentId === 'fc-growth' && s.version === 1)!;
    const v2 = FINCOPILOT.submissions.find((s) => s.departmentId === 'fc-growth' && s.version === 2)!;
    const inputsWithV1 = {
      ...inputs,
      submissions: inputs.submissions.map((s) => (s.departmentId === 'fc-growth' ? { ...v1 } : s)),
    };
    const diff = diffSubmissions(defs, inputs.config, { ...v1 }, { ...v2 }, inputsWithV1);
    expect(diff.lines.length).toBeGreaterThan(0);
    expect(diff.impact!.deltaEbitda).toBeGreaterThan(0);
    // la v1 dépasse l'enveloppe Growth : vérifié en consolidant avec la v1
    const resV1 = consolidate(inputsWithV1);
    expect(resV1.warnings.some((w) => w.code === 'ENVELOPPE_DEPASSEE' && w.departmentId === 'fc-growth')).toBe(true);
  });

  it('NRR budgété sous 100 % au T1 seulement : objectif "NRR > 100 % fin T2" tenu', () => {
    const belowMonths = res.months
      .filter((m) => m.nrrAnnualized !== null && m.nrrAnnualized < 1)
      .map((m) => m.month);
    expect(belowMonths.every((m) => m <= 3)).toBe(true);
    for (let m = 3; m < 12; m++) expect(res.months[m].nrrAnnualized!).toBeGreaterThan(1);
  });
});

describe('seed Hexafloor : même moteur, autre config, budget non finançable', () => {
  const res = consolidate(seedToEngineInputs(HEXAFLOOR));

  it('consolide sans contrôle bloquant', () => {
    expect(res.ok).toBe(true);
  });

  it('le moteur signale un runway sous le seuil de gel et une trésorerie négative', () => {
    const codes = res.warnings.map((w) => w.code);
    expect(codes).toContain('RUNWAY_GEL');
    expect(codes).toContain('TRESORERIE_NEGATIVE');
  });

  it('aucun CAC hors plafond : les alertes sont bien propres à chaque société', () => {
    expect(res.warnings.filter((w) => w.code === 'CAC_PLAFOND')).toEqual([]);
  });
});
