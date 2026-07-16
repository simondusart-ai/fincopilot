/**
 * Navette : conversion montant <-> croissance, trimestre sur trimestre.
 * Module pur, aide a la SAISIE : la croissance n'est jamais stockee ni consolidee, elle
 * se recalcule a partir des montants. Seuls les montants font foi (une seule source de
 * verite, aucun risque de desynchronisation entre les deux lectures d'une meme ligne).
 *
 * Convention : la base d'un trimestre est le trimestre PRECEDENT ; celle du T1 est le
 * realise du T4 de l'annee N-1 (colonne prev_q4). Croissance en POINTS DE POURCENTAGE
 * (20 = +20 %), cohérent avec la saisie a l'ecran, la ou le moteur manipule des fractions.
 */

/**
 * Croissance d'un trimestre par rapport a sa base, en %.
 * null quand la base n'est pas exploitable (absente, nulle ou negative) : sans base,
 * une croissance n'existe pas, et on ne divise jamais par zero.
 */
export function quarterGrowthPct(prev: number | null, value: number): number | null {
  if (prev === null || !Number.isFinite(prev) || prev <= 0) return null;
  if (!Number.isFinite(value)) return null;
  return (value / prev - 1) * 100;
}

/**
 * Montant d'un trimestre deduit d'un objectif de croissance, en %.
 * null si la base n'est pas exploitable. Le resultat est borne a zero : un objectif
 * sous -100 % donnerait un montant negatif, que le moteur refuserait de consolider.
 */
export function quarterValueFromGrowth(prev: number | null, growthPct: number): number | null {
  if (prev === null || !Number.isFinite(prev) || prev <= 0) return null;
  if (!Number.isFinite(growthPct)) return null;
  return Math.max(0, prev * (1 + growthPct / 100));
}
