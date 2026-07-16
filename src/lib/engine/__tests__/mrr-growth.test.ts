import { describe, expect, it } from 'vitest';
import { quarterGrowthPct, quarterValueFromGrowth } from '../mrr-growth';

/**
 * Conversion montant <-> croissance trimestre sur trimestre, dans les deux sens.
 * Ancre : la ligne New MRR de Sales du seed (T4 N-1 13 000, puis 15 / 18 / 20 / 22 K).
 */

describe('quarterGrowthPct : croissance d un trimestre par rapport au precedent', () => {
  it('ancre du seed Sales : 13 000 -> 15 000 -> 18 000 -> 20 000 -> 22 000', () => {
    expect(quarterGrowthPct(13_000, 15_000)!).toBeCloseTo(15.3846, 3);
    expect(quarterGrowthPct(15_000, 18_000)!).toBeCloseTo(20, 6);
    expect(quarterGrowthPct(18_000, 20_000)!).toBeCloseTo(11.1111, 3);
    expect(quarterGrowthPct(20_000, 22_000)!).toBeCloseTo(10, 6);
  });

  it('une baisse donne une croissance negative', () => {
    expect(quarterGrowthPct(20_000, 15_000)!).toBeCloseTo(-25, 6);
  });

  it('un trimestre identique au precedent donne zero', () => {
    expect(quarterGrowthPct(15_000, 15_000)!).toBe(0);
  });

  it('sans base exploitable, aucune croissance : null plutot qu une division par zero', () => {
    expect(quarterGrowthPct(0, 15_000)).toBeNull();
    expect(quarterGrowthPct(null, 15_000)).toBeNull();
    expect(quarterGrowthPct(-100, 15_000)).toBeNull();
  });

  it('un trimestre a zero depuis une base positive donne -100 %', () => {
    expect(quarterGrowthPct(15_000, 0)!).toBeCloseTo(-100, 6);
  });
});

describe('quarterValueFromGrowth : montant deduit d un objectif de croissance', () => {
  it('ancre du seed Sales : +20 % sur 15 000 donne 18 000', () => {
    expect(quarterValueFromGrowth(15_000, 20)!).toBeCloseTo(18_000, 6);
    expect(quarterValueFromGrowth(13_000, 15.3846)!).toBeCloseTo(15_000, 0);
  });

  it('une croissance negative reduit le montant', () => {
    expect(quarterValueFromGrowth(20_000, -25)!).toBeCloseTo(15_000, 6);
  });

  it('-100 % ramene le trimestre a zero, jamais en negatif', () => {
    expect(quarterValueFromGrowth(15_000, -100)!).toBe(0);
    // Un objectif sous -100 % n'a pas de sens : le montant est borne a zero.
    expect(quarterValueFromGrowth(15_000, -150)!).toBe(0);
  });

  it('sans base exploitable, aucun montant : null', () => {
    expect(quarterValueFromGrowth(0, 20)).toBeNull();
    expect(quarterValueFromGrowth(null, 20)).toBeNull();
  });
});

describe('les deux sens sont exactement reciproques', () => {
  it('montant -> croissance -> montant retombe sur le montant de depart', () => {
    for (const [prev, value] of [
      [13_000, 15_000],
      [15_000, 18_000],
      [18_000, 20_000],
      [20_000, 22_000],
      [20_000, 15_000],
    ] as const) {
      const g = quarterGrowthPct(prev, value)!;
      expect(quarterValueFromGrowth(prev, g)!).toBeCloseTo(value, 6);
    }
  });

  it('croissance -> montant -> croissance retombe sur la croissance de depart', () => {
    for (const g of [0, 10, 15.3846, 20, -25, 137.5]) {
      const v = quarterValueFromGrowth(15_000, g)!;
      expect(quarterGrowthPct(15_000, v)!).toBeCloseTo(g, 6);
    }
  });
});
