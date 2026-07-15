/**
 * Navette : CA genere par trimestre a partir des ajouts de MRR (par cohorte).
 * Module pur. Chaque euro de MRR ajoute au mois m facture jusqu'a decembre. Pour un trimestre,
 * on somme sur ses trois mois le cumul des ajouts de MRR mensualises depuis janvier, puis on
 * ajoute les revenus non recurrents (one-shot) du trimestre. Le total annuel est la somme des
 * quatre trimestres. C'est un CA AVANT churn (le churn s'applique a la base totale, au niveau
 * societe) : le CA consolide de l'ecran Budget fait foi.
 */
export function caGeneratedByQuarter(monthlyMrrAdded: number[], oneShotQuarters: number[]): number[] {
  const cumulative: number[] = [];
  let acc = 0;
  for (let m = 0; m < 12; m++) {
    acc += monthlyMrrAdded[m] ?? 0;
    cumulative.push(acc);
  }
  return [0, 1, 2, 3].map((quarter) => {
    let billed = 0;
    for (let m = 3 * quarter; m < 3 * quarter + 3; m++) billed += cumulative[m];
    return billed + (oneShotQuarters[quarter] ?? 0);
  });
}
