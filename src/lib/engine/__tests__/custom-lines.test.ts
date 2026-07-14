import { describe, expect, it } from 'vitest';
import { consolidate } from '../consolidate';
import { diffSubmissions } from '../diff';
import { sum } from '../monthlyize';
import type { CompanyConfig, ConsolidationInputs, DriverDef, SubmissionLine } from '../types';

/**
 * Lignes libres du métier : elles portent leur type, leur libellé et leur fréquence,
 * et s'ajoutent aux lignes du référentiel dans le total du département, le diff
 * et la consolidation.
 */

const config: CompanyConfig = {
  name: 'T', budgetYear: 2027, openingCash: 1_000_000, openingMrr: 100_000, arpa: 100,
  grossMarginPct: 0.7, monthlyChurnPct: 0, runwayVigilanceMonths: 18, runwayFreezeMonths: 12,
};
const driverDefs: DriverDef[] = [{ id: 'p1', departmentId: 'd1', code: 'P1', label: 'Salaires socle', kind: 'payroll' }];

const inputs = (lines: SubmissionLine[]): ConsolidationInputs => ({
  config,
  departments: [{ id: 'd1', code: 'D1', name: 'Dept', envelope: 2_000_000, isSalesMarketing: false }],
  channels: [],
  driverDefs,
  submissions: [{ departmentId: 'd1', version: 1, status: 'submitted', lines }],
});

const driverLine: SubmissionLine = { driverDefId: 'p1', q: [30_000, 30_000, 30_000, 30_000] };

describe('lignes libres : consolidation', () => {
  it('une ligne libre de salaires s ajoute au cout du departement et pese sur l EBITDA', () => {
    const sans = consolidate(inputs([driverLine]));
    const avec = consolidate(
      inputs([
        driverLine,
        { id: 'c1', kind: 'payroll', label: 'Head of Sales', frequency: 'mensuel', q: [45_000, 45_000, 45_000, 45_000] },
      ]),
    );
    expect(avec.ok).toBe(true);
    const dSans = sans.departments.find((d) => d.departmentId === 'd1')!;
    const dAvec = avec.departments.find((d) => d.departmentId === 'd1')!;
    expect(dAvec.annualCost).toBeCloseTo(dSans.annualCost + 180_000, 6);
    expect(avec.totals!.ebitda).toBeCloseTo(sans.totals!.ebitda - 180_000, 6);
  });

  it('la frequence pilote la mensualisation : trimestriel tombe au dernier mois du trimestre', () => {
    const res = consolidate(
      inputs([
        driverLine,
        { id: 'c1', kind: 'opex', label: 'Hubspot', frequency: 'trimestriel', q: [12_000, 0, 0, 0] },
      ]),
    );
    // 12 000 en totalite sur mars (index 2), rien en janvier ni fevrier.
    expect(res.months[0].opexTotal).toBeCloseTo(0, 6);
    expect(res.months[1].opexTotal).toBeCloseTo(0, 6);
    expect(res.months[2].opexTotal).toBeCloseTo(12_000, 6);
    expect(sum(res.months.map((m) => m.opexTotal))).toBeCloseTo(12_000, 6);
  });

  it('une ligne libre capex est hors EBITDA mais se deduit de la tresorerie au mois ou elle tombe', () => {
    const sans = consolidate(inputs([driverLine]));
    const avec = consolidate(
      inputs([
        driverLine,
        { id: 'c1', kind: 'capex', label: 'Poste de travail', frequency: 'one_shot', q: [0, 60_000, 0, 0] },
      ]),
    );
    expect(avec.totals!.ebitda).toBeCloseTo(sans.totals!.ebitda, 6);
    // one_shot du T2 : premier mois du trimestre, soit avril (index 3).
    expect(avec.months[3].capexTotal).toBeCloseTo(60_000, 6);
    expect(avec.totals!.endCash).toBeCloseTo(sans.totals!.endCash - 60_000, 6);
    const d = avec.departments.find((x) => x.departmentId === 'd1')!;
    const dSans = sans.departments.find((x) => x.departmentId === 'd1')!;
    expect(d.annualCost).toBeCloseTo(dSans.annualCost + 60_000, 6);
  });
});

describe('lignes libres : controles bloquants', () => {
  it('refuse un libelle vide', () => {
    const res = consolidate(inputs([driverLine, { id: 'c1', kind: 'opex', label: '  ', frequency: 'mensuel', q: [1, 1, 1, 1] }]));
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'LIGNE_LIBRE_LIBELLE')).toBe(true);
  });

  it('refuse un type non admis en ligne libre (effectifs, canaux)', () => {
    const res = consolidate(inputs([driverLine, { id: 'c1', kind: 'headcount', label: 'ETP', frequency: 'mensuel', q: [1, 1, 1, 1] }]));
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'LIGNE_LIBRE_TYPE')).toBe(true);
  });

  it('refuse une valeur negative, en la localisant', () => {
    const res = consolidate(inputs([driverLine, { id: 'c1', kind: 'opex', label: 'Lemlist', frequency: 'mensuel', q: [0, -5_000, 0, 0] }]));
    expect(res.ok).toBe(false);
    const neg = res.blocking.find((a) => a.code === 'LIGNE_NEGATIVE');
    expect(neg?.quarter).toBe(2);
  });

  it('refuse deux lignes libres au meme libelle', () => {
    const res = consolidate(
      inputs([
        driverLine,
        { id: 'c1', kind: 'opex', label: 'Notion', frequency: 'mensuel', q: [1, 1, 1, 1] },
        { id: 'c2', kind: 'opex', label: 'Notion', frequency: 'mensuel', q: [2, 2, 2, 2] },
      ]),
    );
    expect(res.ok).toBe(false);
    expect(res.blocking.some((a) => a.code === 'LIGNE_LIBRE_DOUBLON')).toBe(true);
  });
});

describe('lignes libres : diff entre versions', () => {
  it('apparie les lignes libres par libelle et chiffre leur impact annuel', () => {
    const before = {
      departmentId: 'd1', version: 1, status: 'submitted' as const,
      lines: [driverLine, { id: 'c1', kind: 'opex' as const, label: 'Hubspot', frequency: 'mensuel' as const, q: [10_000, 10_000, 10_000, 10_000] as [number, number, number, number] }],
    };
    const after = {
      departmentId: 'd1', version: 2, status: 'submitted' as const,
      lines: [
        driverLine,
        { id: 'c1', kind: 'opex' as const, label: 'Hubspot', frequency: 'mensuel' as const, q: [12_000, 12_000, 12_000, 12_000] as [number, number, number, number] },
        { id: 'c2', kind: 'opex' as const, label: 'Lemlist', frequency: 'mensuel' as const, q: [5_000, 5_000, 5_000, 5_000] as [number, number, number, number] },
      ],
    };
    const diff = diffSubmissions(driverDefs, config, before, after);
    const hubspot = diff.lines.find((l) => l.label === 'Hubspot')!;
    const lemlist = diff.lines.find((l) => l.label === 'Lemlist')!;
    expect(hubspot.isCustom).toBe(true);
    expect(hubspot.deltaAnnual).toBeCloseTo(8_000, 6);
    expect(lemlist.before).toBeNull(); // ligne ajoutee
    expect(lemlist.deltaAnnual).toBeCloseTo(20_000, 6);
    // la ligne de referentiel inchangee n'apparait pas
    expect(diff.lines.some((l) => l.driverDefId === 'p1')).toBe(false);
  });
});
