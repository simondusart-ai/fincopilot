import { describe, expect, it } from 'vitest';
import { computeActuals, type ActualsParams } from '../actuals';
import { FINCOPILOT, FINCOPILOT_ACTUALS_2026, FINCOPILOT_SIMULATION } from '../../seed-data';

/**
 * Tests du moteur des indicateurs realises, ancres sur l'historique 2026 FinCopilot.
 * Conventions retenues (cf. echanges de cadrage) :
 * - base clients : roll-forward ancre sur openingClients (13 241), donnees fournies verbatim ;
 *   l'ouverture est calee pour que les +9 984 nets de 2026 terminent l'annee a 23 225 clients,
 *   la base de fin N de reference (Section 1, hypotheses de simulation, effort en CAC rebound) ;
 * - runway : burn du dernier mois (6230/280 = 22,3 mois en decembre).
 */

const params: ActualsParams = {
  arpa: FINCOPILOT.config.arpa,
  grossMarginPct: FINCOPILOT.config.grossMarginPct,
  openingClients: FINCOPILOT.openingClients,
  runwayVigilanceMonths: FINCOPILOT.config.runwayVigilanceMonths,
  runwayFreezeMonths: FINCOPILOT.config.runwayFreezeMonths,
  cacAvgTarget: FINCOPILOT.cacAvgTarget,
  channels: FINCOPILOT.channels.map((c) => ({ id: c.id, name: c.name, cacCap: c.cacCap })),
};

describe('computeActuals : ancrage sur l historique 2026 FinCopilot', () => {
  const res = computeActuals(params, FINCOPILOT_ACTUALS_2026, []);
  const dec = res.months.find((m) => m.month === 12)!;

  it('base clients fin decembre 2026 = 23 225 (roll-forward depuis 13 241)', () => {
    // Ancre de reference : la meme base de fin N que les hypotheses de simulation
    // (baseClientsEndN) et que le bloc CAC du scenario rebound.
    expect(dec.baseOpen).toBe(22_385);
    expect(dec.baseEnd).toBe(23_225);
    expect(res.endBaseClients).toBe(23_225);
  });

  it('churn logo de decembre = 291 / 22 385 = 1,30 %', () => {
    expect(dec.monthlyLogoChurn!).toBeCloseTo(291 / 22_385, 6);
    expect(dec.monthlyLogoChurn! * 100).toBeCloseTo(1.3, 2);
  });

  it('CAC moyen charge de decembre proche de 643 EUR', () => {
    expect(dec.cacAvg!).toBeCloseTo(643, 0);
  });

  it('runway de decembre proche de 22,3 mois (6230/280)', () => {
    expect(dec.runwayMonths!).toBeCloseTo(6_230_000 / 280_000, 1);
  });

  it('somme des sm_spend 2026 proche de 7 000 000 EUR (a 5 000 pres)', () => {
    const sum = FINCOPILOT_ACTUALS_2026.reduce((a, m) => a + m.smSpend, 0);
    expect(Math.abs(sum - 7_000_000)).toBeLessThan(5_000);
  });

  it('utilise le NRR mesure quand il est saisi, jamais un proxy', () => {
    expect(res.months.every((m) => m.nrrIsProxy === false)).toBe(true);
    expect(dec.nrr!).toBeCloseTo(0.99, 5);
  });

  it('signale le CAC moyen au-dessus de la cible 515 au second semestre, sans jamais bloquer', () => {
    const cacAlerts = res.alerts.filter((a) => a.code === 'CAC_MOYEN_CIBLE');
    expect(cacAlerts.map((a) => a.month)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(res.alerts.every((a) => a.severity === 'alerte')).toBe(true);
  });

  it('aucune alerte de runway en 2026 : la tresorerie reste au-dessus des seuils', () => {
    expect(res.alerts.filter((a) => a.code === 'RUNWAY_GEL' || a.code === 'RUNWAY_VIGILANCE')).toEqual([]);
  });

  it('une donnee manquante ne casse rien : pas de burn ni de runway avant juillet', () => {
    const jun = res.months.find((m) => m.month === 6)!;
    expect(jun.burn).toBeNull();
    expect(jun.runwayMonths).toBeNull();
    expect(jun.cashEnd).toBeNull();
  });

  it('roll-forward et churn logo : base d ouverture janvier = 13 241, churn mensuel positif', () => {
    const jan = res.months.find((m) => m.month === 1)!;
    expect(jan.baseOpen).toBe(13_241);
    expect(jan.baseEnd).toBe(13_241 + 834 - 234);
    expect(jan.monthlyLogoChurn!).toBeCloseTo(234 / 13_241, 5);
    // 1,7672 % : l'ecran affiche toujours 1,8 % a une decimale, comme avec l'ancienne ouverture.
    expect((jan.monthlyLogoChurn! * 100).toFixed(1)).toBe('1.8');
  });

  it('la base de fin 2026 alimente la base de depart des hypotheses de simulation', () => {
    // Verrou de coherence : si l'un des deux bouge sans l'autre, la lecture du scenario
    // rebound (effort en CAC) et le realise ne parlent plus de la meme societe.
    expect(res.endBaseClients).toBe(FINCOPILOT_SIMULATION.baseClientsEndN);
  });
});

describe('computeActuals : robustesse (divisions par zero, series vides)', () => {
  it('une serie vide renvoie des tableaux vides et aucune base de fin', () => {
    const res = computeActuals(params, [], []);
    expect(res.months).toEqual([]);
    expect(res.alerts).toEqual([]);
    expect(res.endBaseClients).toBeNull();
  });

  it('un mois sans nouveau client ne divise pas par zero (CAC null)', () => {
    const res = computeActuals(
      { ...params, cacAvgTarget: 515 },
      [{ month: 1, newClients: 0, churnedClients: 0, mrrEnd: 100_000, revenueMonth: null, smSpend: 10_000, cashEnd: null, nrrMeasured: null }],
      [],
    );
    expect(res.months[0].cacAvg).toBeNull();
    expect(res.alerts.filter((a) => a.code === 'CAC_MOYEN_CIBLE')).toEqual([]);
  });
});
