/** Formatage des nombres pour l'affichage (locale française). */

export function fmtEur(value: number, digits = 0): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} €`;
}

export function fmtKEur(value: number): string {
  return `${Math.round(value / 1000).toLocaleString('fr-FR')} k€`;
}

export function fmtPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`;
}

export function fmtMonths(value: number | null): string {
  if (value === null) return 'n.a.';
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`;
}

export const MONTH_LABELS = [
  'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc',
];
