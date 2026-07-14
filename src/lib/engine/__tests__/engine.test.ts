import { describe, expect, it } from 'vitest';
import {
  consolidate,
  diffSubmissions,
  monthlyizeFlow,
  monthlyizeLevel,
  type ConsolidationInputs,
  type Submission,
} from '../index';

/**
 * Jeu de données de test minimal, calculé à la main :
 * - Growth (S&M) : canal SEA, 60 000 EUR et 100 clients par trimestre, CAC 600 EUR (plafond 500).
 * - Tech : 5 puis 6 ETP à 8 000 EUR par mois, opex 15 000 EUR par trimestre.
 * - Config : ARPA 40 EUR, marge brute 70 %, churn mensuel 1 %, MRR ouvert 100 000 EUR.
 */
function fixture(): ConsolidationInputs {
  return {
    config: {
      name: 'TestCo',
      budgetYear: 2027,
      openingCash: 1_000_000,
      openingMrr: 100_000,
      arpa: 40,
      grossMarginPct: 0.7,
      monthlyChurnPct: 0.01,
      runwayVigilanceMonths: 18,
      runwayFreezeMonths: 12,
      paybackCapMonths: 18,
    },
    departments: [
      { id: 'growth', code: 'GRW', name: 'Growth', envelope: 300_000, isSalesMarketing: true },
      { id: 'tech', code: 'TEC', name: 'Tech', envelope: 500_000, isSalesMarketing: false },
    ],
    channels: [{ id: 'sea', name: 'SEA', cacCap: 500 }],
    driverDefs: [
      { id: 'grw_spend', departmentId: 'growth', code: 'SEA_SPEND', label: 'Dépenses SEA', kind: 'channel_spend', channelId: 'sea' },
      { id: 'grw_cust', departmentId: 'growth', code: 'SEA_CUST', label: 'Nouveaux clients SEA', kind: 'channel_customers', channelId: 'sea' },
      { id: 'tec_hc', departmentId: 'tech', code: 'HC', label: 'Effectifs Tech (ETP)', kind: 'headcount' },
      { id: 'tec_opex', departmentId: 'tech', code: 'OPEX', label: 'Hébergement et outils', kind: 'opex' },
    ],
    submissions: [
      {
        departmentId: 'growth',
        version: 1,
        status: 'submitted',
        lines: [
          { driverDefId: 'grw_spend', q: [60_000, 60_000, 60_000, 60_000] },
          { driverDefId: 'grw_cust', q: [100, 100, 100, 100] },
        ],
      },
      {
        departmentId: 'tech',
        version: 1,
        status: 'submitted',
        lines: [
          { driverDefId: 'tec_hc', q: [5, 5, 6, 6], unitCost: 8_000 },
          { driverDefId: 'tec_opex', q: [15_000, 15_000, 15_000, 15_000] },
        ],
      },
    ],
  };
}

describe('mensualisation', () => {
  it('répartit linéairement un flux trimestriel et préserve la somme', () => {
    const months = monthlyizeFlow([300, 0, 90, 0]);
    expect(months[0]).toBeCloseTo(100);
    expect(months[6]).toBeCloseTo(30);
    expect(months.reduce((a, b) => a + b, 0)).toBeCloseTo(390);
  });

  it('applique une clé saisonnière au prorata dans le trimestre', () => {
    const key = [2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const months = monthlyizeFlow([300, 0, 0, 0], key);
    expect(months[0]).toBeCloseTo(200);
    expect(months[1]).toBeCloseTo(100);
    expect(months[2]).toBeCloseTo(0);
    expect(months.reduce((a, b) => a + b, 0)).toBeCloseTo(300);
  });

  it('retombe en linéaire si les coefficients du trimestre somment à zéro', () => {
    const key = [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const months = monthlyizeFlow([300, 0, 0, 0], key);
    expect(months[0]).toBeCloseTo(100);
  });

  it('étale un niveau (effectifs) sans le diviser', () => {
    const months = monthlyizeLevel([5, 5, 6, 6]);
    expect(months[0]).toBe(5);
    expect(months[5]).toBe(5);
    expect(months[6]).toBe(6);
    expect(months[11]).toBe(6);
  });
});

describe('roll-forward MRR et P&L', () => {
  it('reconstruit le MRR mois par mois (vérifié à la main)', () => {
    const res = consolidate(fixture());
    expect(res.ok).toBe(true);
    const m1 = res.months[0];
    // churn : 1 % de 100 000 = 1 000 ; ajouts : 100/3 clients x 40 EUR = 1 333,33
    expect(m1.churnedMrr).toBeCloseTo(1_000);
    expect(m1.newMrr).toBeCloseTo(1_333.33, 1);
    expect(m1.mrrEnd).toBeCloseTo(100_333.33, 1);
    const m2 = res.months[1];
    expect(m2.mrrOpen).toBeCloseTo(100_333.33, 1);
    expect(m2.churnedMrr).toBeCloseTo(1_003.33, 1);
    expect(m2.mrrEnd).toBeCloseTo(100_663.33, 1);
  });

  it('calcule marge brute, S&M, contribution et EBITDA du mois 1 (vérifié à la main)', () => {
    const res = consolidate(fixture());
    const m1 = res.months[0];
    expect(m1.grossMargin).toBeCloseTo(70_233.33, 1);
    expect(m1.smSpend).toBeCloseTo(20_000); // dépenses SEA du mois
    expect(m1.contributionMargin).toBeCloseTo(50_233.33, 1);
    expect(m1.totalDeptCosts).toBeCloseTo(65_000); // 20 000 Growth + 40 000 salaires + 5 000 opex
    expect(m1.ebitda).toBeCloseTo(5_233.33, 1);
    expect(m1.cash).toBeCloseTo(1_005_233.33, 1);
    expect(m1.runwayMonths).toBeNull(); // EBITDA positif : pas de burn
  });

  it('agrège les totaux annuels', () => {
    const res = consolidate(fixture());
    expect(res.totals!.newMrrAnnual).toBeCloseTo(16_000); // 400 clients x 40 EUR
    expect(res.totals!.blendedCac).toBeCloseTo(600); // 240 000 / 400
    expect(res.totals!.grossPaybackMonths).toBeCloseTo(600 / 28, 2); // CAC / (ARPA x 70 %)
  });
});

describe('alertes de gestion (jamais bloquantes)', () => {
  it('signale un CAC au-dessus du plafond, par canal et par trimestre', () => {
    const res = consolidate(fixture());
    const cac = res.warnings.filter((w) => w.code === 'CAC_PLAFOND');
    expect(cac).toHaveLength(4); // 600 EUR > 500 EUR sur les 4 trimestres
    expect(cac[0].channelId).toBe('sea');
  });

  it('signale un dépassement d’enveloppe de cadrage', () => {
    const res = consolidate(fixture());
    const env = res.warnings.filter((w) => w.code === 'ENVELOPPE_DEPASSEE');
    // Tech : salaires 528 000 + opex 60 000 = 588 000 pour 500 000 d'enveloppe
    expect(env).toHaveLength(1);
    expect(env[0].departmentId).toBe('tech');
  });

  it('signale un NRR budgété sous 100 % et un payback au-dessus du plafond', () => {
    const res = consolidate(fixture());
    expect(res.warnings.some((w) => w.code === 'NRR_SOUS_100')).toBe(true);
    expect(res.warnings.some((w) => w.code === 'PAYBACK_PLAFOND')).toBe(true);
  });

  it('signale des dépenses de canal sans clients prévus (CAC non calculable)', () => {
    const inputs = fixture();
    inputs.submissions[0].lines[1].q = [0, 100, 100, 100];
    const res = consolidate(inputs);
    const w = res.warnings.filter((x) => x.code === 'CAC_NON_CALCULABLE');
    expect(w).toHaveLength(1);
    expect(w[0].quarter).toBe(1);
  });

  it('signale runway sous seuil et trésorerie négative sur un budget en burn', () => {
    const inputs = fixture();
    inputs.config.openingMrr = 0;
    inputs.config.openingCash = 100_000;
    inputs.submissions = [
      { departmentId: 'growth', version: 1, status: 'submitted', lines: [{ driverDefId: 'grw_spend', q: [0, 0, 0, 0] }, { driverDefId: 'grw_cust', q: [0, 0, 0, 0] }] },
      { departmentId: 'tech', version: 1, status: 'submitted', lines: [{ driverDefId: 'tec_hc', q: [0, 0, 0, 0], unitCost: 8_000 }, { driverDefId: 'tec_opex', q: [30_000, 30_000, 30_000, 30_000] }] },
    ];
    const res = consolidate(inputs);
    expect(res.ok).toBe(true); // un budget en burn n'est pas une erreur de données
    // burn 10 000 EUR par mois : runway mois 1 = 90 000 / 10 000 = 9 mois, sous le gel (12)
    expect(res.months[0].runwayMonths).toBeCloseTo(9);
    expect(res.warnings.some((w) => w.code === 'RUNWAY_GEL')).toBe(true);
    expect(res.warnings.some((w) => w.code === 'TRESORERIE_NEGATIVE')).toBe(true);
  });
});

describe('contrôles bloquants (intégrité des données)', () => {
  it('refuse de consolider si une navette manque, sans produire de chiffres', () => {
    const inputs = fixture();
    inputs.submissions = inputs.submissions.slice(0, 1);
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'NAVETTE_MANQUANTE')).toBe(true);
    expect(res.months).toHaveLength(0);
    expect(res.totals).toBeNull();
  });

  it('refuse une navette encore en brouillon', () => {
    const inputs = fixture();
    inputs.submissions[0].status = 'draft';
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'NAVETTE_NON_SOUMISE')).toBe(true);
  });

  it('refuse deux navettes pour le même département', () => {
    const inputs = fixture();
    inputs.submissions.push({ ...inputs.submissions[0] });
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'NAVETTE_DOUBLON')).toBe(true);
  });

  it('refuse une valeur négative ou non numérique, en la localisant', () => {
    const inputs = fixture();
    inputs.submissions[1].lines[1].q = [15_000, -5_000, Number.NaN, 15_000];
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    const neg = res.blocking.find((a) => a.code === 'LIGNE_NEGATIVE');
    const nan = res.blocking.find((a) => a.code === 'LIGNE_NON_NUMERIQUE');
    expect(neg?.quarter).toBe(2);
    expect(nan?.quarter).toBe(3);
  });

  it('refuse une ligne effectifs sans coût unitaire', () => {
    const inputs = fixture();
    delete inputs.submissions[1].lines[0].unitCost;
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'LIGNE_COUT_UNITAIRE')).toBe(true);
  });

  it('refuse une configuration société invalide', () => {
    const inputs = fixture();
    inputs.config.arpa = 0;
    inputs.config.grossMarginPct = 1.4;
    const res = consolidate(inputs);
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'CONFIG_ARPA')).toBe(true);
    expect(res.blocking.some((a) => a.code === 'CONFIG_MARGE')).toBe(true);
  });
});

describe('nouveaux kinds : payroll, cogs, revenue_other', () => {
  function withExtraDefs(): ConsolidationInputs {
    const inputs = fixture();
    inputs.driverDefs.push(
      { id: 'tec_cogs', departmentId: 'tech', code: 'COGS', label: 'Infra de production (COGS)', kind: 'cogs' },
      { id: 'tec_pay', departmentId: 'tech', code: 'PAY', label: 'Masse salariale data', kind: 'payroll' },
      { id: 'grw_oneoff', departmentId: 'growth', code: 'ONEOFF', label: 'Prestations one-shot', kind: 'revenue_other' },
    );
    inputs.submissions[1].lines.push(
      { driverDefId: 'tec_cogs', q: [90_000, 90_000, 90_000, 90_000] },
      { driverDefId: 'tec_pay', q: [30_000, 30_000, 30_000, 30_000] },
    );
    inputs.submissions[0].lines.push({ driverDefId: 'grw_oneoff', q: [12_000, 12_000, 12_000, 12_000] });
    return inputs;
  }

  it('revenue_other entre dans le revenu mais pas dans le MRR ni le NRR', () => {
    const inputs = withExtraDefs();
    const res = consolidate(inputs);
    const m1 = res.months[0];
    expect(m1.otherRevenue).toBeCloseTo(4_000);
    expect(m1.revenue).toBeCloseTo(m1.mrrEnd + 4_000, 1);
    // le MRR reste celui de la fixture de base
    expect(m1.mrrEnd).toBeCloseTo(100_333.33, 1);
  });

  it('avec des lignes COGS, la marge brute devient revenu - COGS et l’EBITDA ne compte pas les COGS deux fois', () => {
    const inputs = withExtraDefs();
    const res = consolidate(inputs);
    const m1 = res.months[0];
    expect(m1.cogsTotal).toBeCloseTo(30_000);
    expect(m1.grossMargin).toBeCloseTo(m1.revenue - 30_000, 1);
    // hors COGS : 20 000 SEA + 40 000 salaires ETP + 10 000 payroll + 5 000 opex = 75 000
    expect(m1.ebitda).toBeCloseTo(m1.grossMargin - 75_000, 1);
    expect(m1.payrollTotal).toBeCloseTo(50_000);
  });

  it('les COGS comptent dans le coût annuel du département (enveloppe)', () => {
    const inputs = withExtraDefs();
    const res = consolidate(inputs);
    const tech = res.departments.find((d) => d.departmentId === 'tech')!;
    // 528 000 salaires ETP + 120 000 payroll + 60 000 opex + 360 000 COGS
    expect(tech.annualCost).toBeCloseTo(1_068_000);
  });

  it('le payback utilise la marge brute effective du budget', () => {
    const inputs = withExtraDefs();
    const res = consolidate(inputs);
    const t = res.totals!;
    expect(t.effectiveGrossMarginPct).toBeCloseTo(t.grossMargin / t.revenue, 6);
    expect(t.grossPaybackMonths).toBeCloseTo(t.blendedCac! / (inputs.config.arpa * t.effectiveGrossMarginPct!), 4);
  });

  it('sans lignes COGS, la marge brute reste au taux de la config', () => {
    const res = consolidate(fixture());
    const m1 = res.months[0];
    expect(m1.cogsTotal).toBe(0);
    expect(m1.grossMargin).toBeCloseTo(m1.revenue * 0.7, 1);
  });
});

describe('diff entre versions de navette', () => {
  it('détecte les lignes modifiées et chiffre leur impact annuel', () => {
    const inputs = fixture();
    const v1 = inputs.submissions[1]; // Tech
    const v2: Submission = {
      ...v1,
      version: 2,
      lines: [
        { driverDefId: 'tec_hc', q: [5, 5, 5, 5], unitCost: 8_000 }, // gel des recrutements T3-T4
        { driverDefId: 'tec_opex', q: [15_000, 15_000, 15_000, 15_000] }, // inchangé
      ],
    };
    const diff = diffSubmissions(inputs.driverDefs, inputs.config, v1, v2, inputs);
    expect(diff.lines).toHaveLength(1); // la ligne opex inchangée n'apparaît pas
    expect(diff.lines[0].driverDefId).toBe('tec_hc');
    // avant : 22 ETP-trimestres x 3 mois x 8 000 = 528 000 ; après : 480 000
    expect(diff.lines[0].deltaAnnual).toBeCloseTo(-48_000);
    expect(diff.impact).not.toBeNull();
    expect(diff.impact!.deltaEbitda).toBeCloseTo(48_000); // moins de coûts, plus d'EBITDA
    expect(diff.impact!.deltaEndCash).toBeCloseTo(48_000);
  });

  it('détecte une ligne ajoutée et une ligne supprimée', () => {
    const inputs = fixture();
    const v1 = inputs.submissions[0]; // Growth
    const v2: Submission = {
      ...v1,
      version: 2,
      lines: [{ driverDefId: 'grw_spend', q: [60_000, 60_000, 60_000, 60_000] }],
    };
    const diff = diffSubmissions(inputs.driverDefs, inputs.config, v1, v2);
    expect(diff.lines).toHaveLength(1);
    expect(diff.lines[0].after).toBeNull(); // clients SEA supprimés
    expect(diff.lines[0].deltaAnnual).toBeCloseTo(-16_000); // 400 clients x 40 EUR
  });

  it('refuse de comparer deux départements différents', () => {
    const inputs = fixture();
    expect(() =>
      diffSubmissions(inputs.driverDefs, inputs.config, inputs.submissions[0], inputs.submissions[1]),
    ).toThrow();
  });
});
