import type { QuarterValues } from './types';

/** Indices des mois (0 à 11) composant chaque trimestre. */
const QUARTER_MONTHS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
];

function isValidKey(key: number[] | undefined): key is number[] {
  if (!key || key.length !== 12) return false;
  return key.every((k) => Number.isFinite(k) && k >= 0);
}

/**
 * Répartit des valeurs trimestrielles (flux) sur 12 mois.
 * Sans clé : répartition linéaire (1/3 par mois).
 * Avec clé : au sein de chaque trimestre, répartition au prorata des coefficients du mois.
 * Si les coefficients d'un trimestre somment à zéro, retour à la répartition linéaire pour ce trimestre.
 * Propriété garantie : la somme des 12 mois est égale à la somme des 4 trimestres.
 */
export function monthlyizeFlow(quarters: QuarterValues, key?: number[]): number[] {
  const months = new Array<number>(12).fill(0);
  const useKey = isValidKey(key);
  for (let q = 0; q < 4; q++) {
    const value = quarters[q];
    const idx = QUARTER_MONTHS[q];
    if (useKey) {
      const coefs = idx.map((m) => key[m]);
      const total = coefs[0] + coefs[1] + coefs[2];
      if (total > 0) {
        for (let i = 0; i < 3; i++) months[idx[i]] = (value * coefs[i]) / total;
        continue;
      }
    }
    for (let i = 0; i < 3; i++) months[idx[i]] = value / 3;
  }
  return months;
}

/**
 * Étale des valeurs trimestrielles de niveau (ex. effectifs) sur 12 mois :
 * chaque mois du trimestre porte la valeur du trimestre.
 */
export function monthlyizeLevel(quarters: QuarterValues): number[] {
  const months = new Array<number>(12).fill(0);
  for (let q = 0; q < 4; q++) {
    for (const m of QUARTER_MONTHS[q]) months[m] = quarters[q];
  }
  return months;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
