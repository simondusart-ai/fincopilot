/**
 * Graphique comparatif de la trajectoire de tresorerie de cloture des deux scenarios
 * (as is vs rebound) sur les trois exercices projetes. Deux courbes, ligne de zero,
 * repere de la tresorerie d'ouverture. Aucune donnee en dur : tout vient de `points`
 * (montants en K€). Couleurs par variables de charte (var(--color-*)), aucun hex.
 */

const VB_W = 960;
const VB_H = 340;
const PAD_L = 64;
const PAD_R = 24;
const PLOT_L = PAD_L;
const PLOT_R = VB_W - PAD_R;
const PLOT_T = 28;
const PLOT_B = 288;
const LABEL_Y = 314;

function niceStep(range: number): number {
  let step = 5_000;
  while (range / step > 6) step *= 2;
  while (range / step < 3 && step > 1_000) step /= 2;
  return step;
}
const roundTo = (v: number, step: number, dir: 'ceil' | 'floor') =>
  (dir === 'ceil' ? Math.ceil(v / step) : Math.floor(v / step)) * step;

export interface ScenarioChartPoint {
  label: string;
  asIs: number;
  rebound: number;
  opening: number;
}

export function ScenarioChart({ points }: { points: ScenarioChartPoint[] }) {
  const all = points.flatMap((p) => [p.asIs, p.rebound, p.opening, 0]);
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const step = niceStep(rawMax - rawMin || 1);
  const yMin = roundTo(rawMin, step, 'floor');
  const yMax = roundTo(rawMax, step, 'ceil');
  const range = yMax - yMin || 1;

  const x = (i: number) => PLOT_L + (points.length === 1 ? (PLOT_R - PLOT_L) / 2 : ((PLOT_R - PLOT_L) * i) / (points.length - 1));
  const y = (v: number) => PLOT_B - ((v - yMin) / range) * (PLOT_B - PLOT_T);

  const ticks: number[] = [];
  for (let g = yMin; g <= yMax; g += step) ticks.push(g);
  const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR');

  const line = (key: 'asIs' | 'rebound') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p[key])}`).join(' ');
  const openingY = y(points[0]?.opening ?? 0);

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[640px]" role="img" aria-label="Trajectoire de tresorerie de cloture, comparaison des deux scenarios">
          {/* Graduation horizontale */}
          {ticks.map((g) => (
            <g key={g}>
              <line x1={PLOT_L} y1={y(g)} x2={PLOT_R} y2={y(g)} stroke="var(--color-lav)" strokeWidth={1} />
              <text x={PLOT_L - 10} y={y(g) + 3} textAnchor="end" fontSize={11} fill="var(--color-ink)" opacity={0.5}>{fmt(g)}</text>
            </g>
          ))}
          {/* Ligne de zero, si dans le champ */}
          {yMin < 0 && yMax > 0 && (
            <line x1={PLOT_L} y1={y(0)} x2={PLOT_R} y2={y(0)} stroke="var(--color-ink)" strokeWidth={1.25} opacity={0.4} />
          )}
          {/* Repere de la tresorerie d'ouverture (pointille) */}
          <line x1={PLOT_L} y1={openingY} x2={PLOT_R} y2={openingY} stroke="var(--color-ink)" strokeWidth={1} strokeDasharray="2 4" opacity={0.35} />

          {/* Courbe as is (defavorable) : trait pointille sombre */}
          <path d={line('asIs')} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeDasharray="6 4" />
          {points.map((p, i) => (
            <g key={`a${i}`}>
              <circle cx={x(i)} cy={y(p.asIs)} r={3.5} fill="var(--color-ink)" />
              <text x={x(i)} y={y(p.asIs) + (p.asIs >= p.rebound ? -9 : 17)} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)">{fmt(p.asIs)}</text>
            </g>
          ))}

          {/* Courbe rebound (favorable) : trait plein primary */}
          <path d={line('rebound')} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} />
          {points.map((p, i) => (
            <g key={`r${i}`}>
              <circle cx={x(i)} cy={y(p.rebound)} r={3.5} fill="var(--color-primary)" />
              <text x={x(i)} y={y(p.rebound) + (p.rebound >= p.asIs ? -9 : 17)} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-primary)">{fmt(p.rebound)}</text>
            </g>
          ))}

          {/* Etiquettes d'exercice */}
          {points.map((p, i) => (
            <text key={p.label} x={x(i)} y={LABEL_Y} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-ink)" opacity={0.6}>{p.label}</text>
          ))}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink/70">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-primary align-middle" /> Rebound (S&amp;M gelé)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-ink align-middle" /> As is (S&amp;M au rythme historique)
        </span>
        <span className="text-ink/50">Trésorerie de clôture (K€). Repère pointillé : trésorerie d&apos;ouverture.</span>
      </div>
    </div>
  );
}
