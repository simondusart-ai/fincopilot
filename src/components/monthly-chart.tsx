import type { MonthRow } from '@/lib/engine';
import { MONTH_LABELS } from '@/lib/format';

/**
 * Graphique présentationnel à double axe : barres d'EBITDA mensuel (échelle de gauche,
 * sommets arrondis, positives en primary, négatives en lav) et courbe du solde de
 * trésorerie de fin de mois (échelle de droite, indépendante, pour la lisibilité).
 * Aucune donnée en dur : tout vient de `months` (ebitda et cash, en euros).
 * Les couleurs passent par les variables de charte (var(--color-*)), aucun hex.
 */

const VB_W = 960;
const VB_H = 360;
const PAD_L = 50;
const PAD_R = 54;
const PLOT_L = PAD_L;
const PLOT_R = VB_W - PAD_R;
const PLOT_W = PLOT_R - PLOT_L;
const PLOT_T = 24;
const PLOT_B = 312;
const MONTH_Y = 336;
const BAR_W = 30;

function roundTo(v: number, step: number, dir: 'ceil' | 'floor'): number {
  return (dir === 'ceil' ? Math.ceil(v / step) : Math.floor(v / step)) * step;
}

/** Chemin d'une barre à sommet arrondi (côté opposé à la ligne de base). */
function barPath(x: number, w: number, baselineY: number, valueY: number): string {
  const top = Math.min(valueY, baselineY);
  const bottom = Math.max(valueY, baselineY);
  const r = Math.min(6, w / 2, bottom - top);
  if (valueY <= baselineY) {
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${bottom} Z`;
  }
  return `M${x},${top} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${x + w - r},${bottom} Q${x + w},${bottom} ${x + w},${bottom - r} L${x + w},${top} Z`;
}

export function MonthlyChart({ months }: { months: MonthRow[] }) {
  const slot = PLOT_W / months.length;
  const cx = (i: number) => PLOT_L + slot * i + slot / 2;

  const ebitdaK = months.map((m) => m.ebitda / 1000);
  const cashK = months.map((m) => m.cash / 1000);

  // Échelle de gauche : EBITDA (k€), graduée par pas de 100, zéro inclus.
  const eMax = roundTo(Math.max(0, ...ebitdaK), 100, 'ceil');
  const eMin = roundTo(Math.min(0, ...ebitdaK), 100, 'floor');
  const eRange = eMax - eMin || 1;
  const eY = (v: number) => PLOT_B - ((v - eMin) / eRange) * (PLOT_B - PLOT_T);
  const baselineY = eY(0);
  const eTicks: number[] = [];
  for (let g = eMin; g <= eMax; g += 100) eTicks.push(g);

  // Échelle de droite : trésorerie (k€), indépendante, pas de 500 (ou 1000 si large).
  const cMinRaw = Math.min(...cashK);
  const cMaxRaw = Math.max(...cashK);
  let cStep = 500;
  while ((roundTo(cMaxRaw, cStep, 'ceil') - roundTo(cMinRaw, cStep, 'floor')) / cStep > 6) cStep *= 2;
  const cMin = roundTo(cMinRaw, cStep, 'floor');
  const cMax = roundTo(cMaxRaw, cStep, 'ceil');
  const cRange = cMax - cMin || 1;
  const cY = (v: number) => PLOT_B - ((v - cMin) / cRange) * (PLOT_B - PLOT_T);
  const cTicks: number[] = [];
  for (let g = cMin; g <= cMax; g += cStep) cTicks.push(g);

  const cashLine = cashK.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${cY(v)}`).join(' ');
  const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR');

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[720px]" role="img" aria-label="EBITDA mensuel et solde de trésorerie">
          {/* Graduation et axe de gauche : EBITDA (k€) */}
          {eTicks.map((g) => (
            <g key={`e${g}`}>
              <line x1={PLOT_L} y1={eY(g)} x2={PLOT_R} y2={eY(g)} stroke="var(--color-lav)" strokeWidth={1} />
              <text x={PLOT_L - 8} y={eY(g) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink)" opacity={0.5}>{g}</text>
            </g>
          ))}

          {/* Axe de droite : trésorerie (k€) */}
          {cTicks.map((g) => (
            <g key={`c${g}`}>
              <line x1={PLOT_R} y1={cY(g)} x2={PLOT_R + 5} y2={cY(g)} stroke="var(--color-ink)" strokeWidth={1} opacity={0.4} />
              <text x={PLOT_R + 8} y={cY(g) + 3} textAnchor="start" fontSize={10} fill="var(--color-ink)" opacity={0.5}>{fmt(g)}</text>
            </g>
          ))}

          {/* Barres d'EBITDA (échelle de gauche) */}
          {ebitdaK.map((v, i) => {
            const x = cx(i) - BAR_W / 2;
            const positive = v >= 0;
            const labelY = positive ? eY(v) - 6 : eY(v) + 13;
            return (
              <g key={i}>
                <path d={barPath(x, BAR_W, baselineY, eY(v))} fill={positive ? 'var(--color-primary)' : 'var(--color-lav)'} />
                <text x={cx(i)} y={labelY} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)">{fmt(v)}</text>
              </g>
            );
          })}

          {/* Courbe du solde de trésorerie (échelle de droite) */}
          <path d={cashLine} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
          {cashK.map((v, i) => (
            <circle key={i} cx={cx(i)} cy={cY(v)} r={3} fill="var(--color-ink)" />
          ))}

          {/* Étiquettes des mois */}
          {MONTH_LABELS.map((m, i) => (
            <text key={m} x={cx(i)} y={MONTH_Y} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)" opacity={0.6}>{m.toUpperCase()}</text>
          ))}
        </svg>
      </div>

      {/* Légende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink/70">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> EBITDA positif (k€, échelle gauche)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-lav" /> EBITDA négatif (k€, échelle gauche)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 bg-ink align-middle" />
          <span className="-ml-3 inline-block h-1.5 w-1.5 rounded-full bg-ink" /> Solde de trésorerie fin de mois (k€, échelle droite)
        </span>
      </div>
    </div>
  );
}
