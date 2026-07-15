/**
 * Titres humains des codes d'alerte de gestion, pour l'affichage a l'ecran (jamais de code
 * technique ni de underscore). Couverture a 100 % des codes de severite 'alerte' emis par le
 * moteur (consolidate.ts et actuals.ts). Le code technique reste disponible en attribut title.
 * L'export xlsx conserve, lui, les codes bruts (livrable technique).
 */
const ALERT_TITLES: Record<string, string> = {
  ENVELOPPE_DEPASSEE: 'Enveloppe globale dépassée',
  CAC_PLAFOND: 'CAC au-dessus du plafond du canal',
  CAC_NON_CALCULABLE: 'CAC non calculable',
  CAC_MOYEN_CIBLE: 'CAC moyen au-dessus de la cible',
  RUNWAY_VIGILANCE: 'Runway sous le seuil de vigilance',
  RUNWAY_GEL: 'Runway sous le seuil de gel',
  TRESORERIE_NEGATIVE: 'Trésorerie négative en projection',
  NRR_SOUS_100: 'NRR sous 100 %',
  PAYBACK_PLAFOND: 'Payback au-dessus du plafond',
};

/** Titre humain d'un code d'alerte. Repli generique lisible pour tout code inconnu. */
export function alertTitle(code: string): string {
  return ALERT_TITLES[code] ?? 'Alerte de gestion';
}
