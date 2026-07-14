import type { MonthRow } from '@/lib/engine';
import { MONTH_LABELS } from '@/lib/format';

/**
 * Graphique présentationnel : barres d'EBITDA mensuel (sommets arrondis, positives en
 * primary, négatives en lav) et courbe de trésorerie de fin de mois superposée.
 * Aucune donnée en dur : tout vient de `months` (ebitda et cash, en euros).
 * Les couleurs passent par les variables de charte (var(--color-*)), aucun hex.
 */

const VB_W = 960;
const VB_H = 380;
const PAD_L = 44;
const PAD_R = 16;
const PLOT_L = PAD_L;
const PLOT_R = VB_W - PAD_R;
const PLOT_W = PLOT_R - PLOT_L;
const BAR_W = 34;

// Bande haute réservée à la courbe de trésorerie, bande basse aux barres d'EBITDA.
const CASH_TOP = 26;
const CASH_BOTTOM = 150;
const EBITDA_TOP = 178;
const EBITDA_BOTTOM = 336;
const MONTH_Y = 356;

function niceCeil(v: number): number {
  return Math.ceil(v / 100) * 100;
}
function niceFloor(v: number): number {
  return Math.floor(v / 100) * 100;
}

/** Chemin d'une barre à sommet arrondi (côté opposé à la ligne de base). */
function barPath(x: number, w: number, baselineY: number, valueY: number): string {
  const top = Math.min(valueY, baselineY);
  const bottom = Math.max(valueY, baselineY);
  const r = Math.min(6, w / 2, bottom - top);
  if (valueY <= baselineY) {
    // barre positive : coins hauts arrondis
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${bottom} Z`;
  }
  // barre négative : coins bas arrondis
  return `M${x},${top} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${x + w - r},${bottom} Q${x + w},${bottom} ${x + w},${bottom - r} L${x + w},${top} Z`;
}

export function MonthlyChart({ months }: { months: MonthRow[] }) {
  const slot = PLOT_W / months.length;
  const cx = (i: number) => PLOT_L + slot * i + slot / 2;

  const ebitdaK = months.map((m) => m.ebitda / 1000);
  const cashK = months.map((m) => m.cash / 1000);

  // Échelle des barres d'EBITDA (inclut zéro), graduée par pas de 100 k€.
  const eMax = niceCeil(Math.max(0, ...ebitdaK));
  const eMin = niceFloor(Math.min(0, ...ebitdaK));
  const eRange = eMax - eMin || 1;
  const eY = (v: number) => EBITDA_BOTTOM - ((v - eMin) / eRange) * (EBITDA_BOTTOM - EBITDA_TOP);
  const baselineY = eY(0);

  const gridValues: number[] = [];
  for (let g = eMin; g <= eMax; g += 100) gridValues.push(g);

  // Échelle de la trésorerie (bande haute), avec une marge pour aérer.
  const cMaxRaw = Math.max(...cashK);
  const cMinRaw = Math.min(...cashK);
  const cPad = (cMaxRaw - cMinRaw) * 0.15 || 1;
  const cMax = cMaxRaw + cPad;
  const cMin = cMinRaw - cPad;
  const cRange = cMax - cMin || 1;
  const cY = (v: number) => CASH_BOTTOM - ((v - cMin) / cRange) * (CASH_BOTTOM - CASH_TOP);

  const cashLine = cashK.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${cY(v)}`).join(' ');
  const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR');

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[720px]" role="img" aria-label="EBITDA mensuel et trésorerie">
          {/* Lignes de graduation et axe des ordonnées EBITDA (k€) */}
          {gridValues.map((g) => (
            <g key={g}>
              <line x1={PLOT_L} y1={eY(g)} x2={PLOT_R} y2={eY(g)} stroke="var(--color-lav)" strokeWidth={1} />
              <text x={PLOT_L - 8} y={eY(g) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink)" opacity={0.5}>
                {g}
              </text>
            </g>
          ))}

          {/* Barres d'EBITDA */}
          {ebitdaK.map((v, i) => {
            const x = cx(i) - BAR_W / 2;
            const positive = v >= 0;
            const labelY = positive ? eY(v) - 6 : eY(v) + 13;
            return (
              <g key={i}>
                <path d={barPath(x, BAR_W, baselineY, eY(v))} fill={positive ? 'var(--color-primary)' : 'var(--color-lav)'} />
                <text x={cx(i)} y={labelY} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)">
                  {fmt(v)}
                </text>
              </g>
            );
          })}

          {/* Courbe de trésorerie de fin de mois */}
          <path d={cashLine} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
          {cashK.map((v, i) => (
            <g key={i}>
              <circle cx={cx(i)} cy={cY(v)} r={3} fill="var(--color-ink)" />
              <text x={cx(i)} y={cY(v) - 8} textAnchor="middle" fontSize={9} fill="var(--color-ink)" opacity={0.7}>
                {fmt(v)}
              </text>
            </g>
          ))}

          {/* Étiquettes des mois */}
          {MONTH_LABELS.map((m, i) => (
            <text key={m} x={cx(i)} y={MONTH_Y} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)" opacity={0.6}>
              {m.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      {/* Légende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink/70">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> EBITDA positif (k€)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-lav" /> EBITDA négatif (k€)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 bg-ink align-middle" />
          <span className="-ml-3 inline-block h-1.5 w-1.5 rounded-full bg-ink" /> Trésorerie fin de mois (k€)
        </span>
      </div>
    </div>
  );
}
