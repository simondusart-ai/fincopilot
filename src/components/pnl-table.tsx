'use client';

import { useState } from 'react';
import { MONTH_LABELS, fmtPct } from '@/lib/format';

/**
 * Tableau mensuel repliable, presentationnel : douze mois plus une colonne "Total annee"
 * distinguee (fond card-soft, gras). Aucun calcul : il recoit des lignes deja calculees
 * (valeurs mensuelles et total annuel), y compris la convention de total (somme des flux,
 * decembre pour les stocks, ratio d'annee ou de decembre), decidee par l'appelant pour
 * rester exactement alignee sur l'export xlsx.
 */

/** Une ligne : valeurs mensuelles (null = n.a.) et total annuel deja calcules. */
export interface PnlTableRow {
  label: string;
  /** amount : montant en k€ ; pct : fraction affichee en % ; months : nombre de mois. */
  format: 'amount' | 'pct' | 'months';
  /** Ligne de solde surlignee (fond lavande, gras). */
  strong?: boolean;
  /** Sous-ligne grise en italique (ratios). */
  muted?: boolean;
  months: (number | null)[];
  annual: number | null;
}

function renderCell(v: number | null, format: PnlTableRow['format']): { text: string; negative: boolean } {
  if (v === null || !Number.isFinite(v)) return { text: 'n.a.', negative: false };
  if (format === 'pct') return { text: fmtPct(v), negative: false };
  if (format === 'months') return { text: v.toFixed(1), negative: false };
  return { text: Math.round(v / 1000).toLocaleString('fr-FR'), negative: v < 0 };
}

export function CollapsiblePnlTable({
  title,
  rows,
  defaultOpen = false,
  firstColLabel = 'Ligne (k€)',
}: {
  title: string;
  rows: PnlTableRow[];
  defaultOpen?: boolean;
  firstColLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-4 text-left font-semibold text-ink"
      >
        <span className={`inline-block text-primary transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          ▸
        </span>
        {title}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">{firstColLabel}</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>
                ))}
                <th className="bg-card-soft px-4 py-3 text-right font-semibold text-ink">Total année</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowClass = r.strong ? 'bg-lav' : 'border-b border-lav/60';
                const labelClass = r.strong
                  ? 'bg-lav font-semibold'
                  : r.muted
                    ? 'bg-white italic text-ink/50'
                    : 'bg-white';
                const bodyClass = `${r.strong ? 'font-semibold' : ''} ${r.muted ? 'italic text-ink/50' : ''}`;
                const a = renderCell(r.annual, r.format);
                return (
                  <tr key={r.label} className={rowClass}>
                    <td className={`sticky left-0 z-10 px-5 py-1.5 ${labelClass}`}>{r.label}</td>
                    {r.months.map((v, i) => {
                      const c = renderCell(v, r.format);
                      return (
                        <td key={i} className={`px-3 py-1.5 text-right tabular-nums ${c.negative ? 'text-red-600' : ''} ${bodyClass}`}>
                          {c.text}
                        </td>
                      );
                    })}
                    <td className={`bg-card-soft px-4 py-1.5 text-right font-semibold tabular-nums ${a.negative ? 'text-red-600' : ''} ${r.muted ? 'italic' : ''}`}>
                      {a.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
