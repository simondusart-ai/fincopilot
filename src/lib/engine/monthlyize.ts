import type { LineFrequency, QuarterValues } from './types';

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

/**
 * Répartit des valeurs trimestrielles selon la fréquence de décaissement de la ligne.
 * - mensuel : un tiers par mois du trimestre ;
 * - trimestriel : 100 % au dernier mois du trimestre ;
 * - one_shot : 100 % au premier mois du trimestre saisi.
 * Propriété garantie : la somme des 12 mois est égale à la somme des 4 trimestres.
 */
export function monthlyizeByFrequency(quarters: QuarterValues, frequency: LineFrequency): number[] {
  const months = new Array<number>(12).fill(0);
  for (let q = 0; q < 4; q++) {
    const value = quarters[q];
    const idx = QUARTER_MONTHS[q];
    switch (frequency) {
      case 'trimestriel':
        months[idx[2]] += value;
        break;
      case 'one_shot':
        months[idx[0]] += value;
        break;
      case 'mensuel':
      case 'annuel':
      default:
        for (let i = 0; i < 3; i++) months[idx[i]] += value / 3;
        break;
    }
  }
  return months;
}

/**
 * Déduit les quatre valeurs trimestrielles d'un MONTANT unitaire et d'une fréquence.
 * - mensuel : chaque trimestre = montant x 3 (5 000 par mois donnent 15 000 par trimestre) ;
 * - trimestriel : chaque trimestre = montant ;
 * - annuel : chaque trimestre = montant / 4 (60 000 par an donnent 15 000 par trimestre) ;
 * - one_shot : montant sur le trimestre choisi (1 à 4), zéro ailleurs.
 */
export function quartersFromAmount(
  amount: number,
  frequency: LineFrequency,
  oneshotQuarter = 1,
): QuarterValues {
  switch (frequency) {
    case 'mensuel': {
      const v = amount * 3;
      return [v, v, v, v];
    }
    case 'trimestriel':
      return [amount, amount, amount, amount];
    case 'annuel': {
      const v = amount / 4;
      return [v, v, v, v];
    }
    case 'one_shot': {
      const q: QuarterValues = [0, 0, 0, 0];
      const i = Math.min(4, Math.max(1, Math.round(oneshotQuarter))) - 1;
      q[i] = amount;
      return q;
    }
  }
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
