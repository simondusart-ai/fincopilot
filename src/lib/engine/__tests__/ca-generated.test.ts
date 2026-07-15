import { describe, expect, it } from 'vitest';
import { caGeneratedByQuarter } from '../ca-generated';

describe('caGeneratedByQuarter : CA genere par cohorte de MRR', () => {
  it('120 000 de +MRR par trimestre (40 000 par mois) => T1 240k, T2 600k, T3 960k, T4 1 320k', () => {
    const q = caGeneratedByQuarter(new Array(12).fill(40_000), [0, 0, 0, 0]);
    expect(q).toEqual([240_000, 600_000, 960_000, 1_320_000]);
    expect(q.reduce((a, b) => a + b, 0)).toBe(3_120_000);
  });

  it('ajoute les revenus one-shot du trimestre', () => {
    const q = caGeneratedByQuarter(new Array(12).fill(0), [10_000, 0, 0, 5_000]);
    expect(q).toEqual([10_000, 0, 0, 5_000]);
  });
});
