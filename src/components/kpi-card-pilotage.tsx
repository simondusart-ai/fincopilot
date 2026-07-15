/**
 * Carte d'indicateur du Pilotage, d'apres la maquette (docs/design/pilotage-revamp.pdf).
 * Systeme de dimensions : CROISSANCE (violet plein), RENTABILITE (lavande), CASH (filaire +
 * pastille menthe). Filet colore en haut selon la dimension. Un picto SVG dessine a la main par
 * indicateur (trait 1.5, couleur primaire, pastille menthe decorative). Aucune librairie d'icones.
 * Composant purement presentationnel : les valeurs et sous-textes viennent de la page.
 */

export type KpiDimension = 'croissance' | 'rentabilite' | 'cash';
export type KpiIcon = 'curve' | 'loop' | 'target' | 'gauge' | 'flame' | 'pump';

/** Traits de chaque picto (viewBox 24, stroke = couleur primaire heritee). */
const ICON_PATHS: Record<KpiIcon, React.ReactNode> = {
  // Courbe croissante avec fleche (MRR et ajouts nets).
  curve: (
    <>
      <path d="M3 16 C 7 16, 9 8, 13 9 S 18 12, 21 5" />
      <path d="M21 5 h-4" />
      <path d="M21 5 v4" />
    </>
  ),
  // Boucle de retention (NRR).
  loop: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3 v4 h-4" />
    </>
  ),
  // Cible (CAC moyen).
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  // Jauge a aiguille (marge de contribution).
  gauge: (
    <>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M12 15 L16.5 10.5" />
    </>
  ),
  // Flamme (burn du mois).
  flame: (
    <>
      <path d="M12 21a6 6 0 0 1-6-6c0-3 2-5 3.5-7.5C10 5 9.5 4 12 2c0 3 1 4 2.5 6C16 10 18 12 18 15a6 6 0 0 1-6 6Z" />
      <path d="M12 21a3 3 0 0 1-3-3c0-1.6 1.2-2.6 2-4 .8 1.4 2 2.2 2 4a3 3 0 0 1-1 3Z" />
    </>
  ),
  // Pompe a essence (runway).
  pump: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v16" />
      <path d="M3.5 21h11" />
      <rect x="6.5" y="6" width="4" height="3.5" rx="0.5" />
      <path d="M12 11h2.5a1.5 1.5 0 0 1 1.5 1.5V17a1.75 1.75 0 0 0 3.5 0V9.5L17 7" />
    </>
  ),
};

function Picto({ icon }: { icon: KpiIcon }) {
  return (
    <span className="text-primary" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[icon]}
        {/* Pastille menthe decorative, coin haut droit. */}
        <circle cx="20.5" cy="4" r="2.4" fill="var(--color-mint)" stroke="none" />
      </svg>
    </span>
  );
}

function DimensionTag({ dimension }: { dimension: KpiDimension }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
  if (dimension === 'croissance') return <span className={`${base} bg-primary text-white`}>Croissance</span>;
  if (dimension === 'rentabilite') return <span className={`${base} bg-lav text-ink`}>Rentabilité</span>;
  return (
    <span className={`${base} border border-lav bg-white text-ink`}>
      <span className="h-1.5 w-1.5 rounded-full bg-mint" />
      Cash
    </span>
  );
}

const FILET: Record<KpiDimension, string> = {
  croissance: 'bg-primary',
  rentabilite: 'bg-lav',
  cash: 'bg-mint',
};

export function KpiCardPilotage({
  dimension,
  icon,
  title,
  value,
  bad = false,
  sub,
  italic,
}: {
  dimension: KpiDimension;
  icon: KpiIcon;
  title: string;
  value: string;
  bad?: boolean;
  sub?: string;
  italic?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${FILET[dimension]}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <DimensionTag dimension={dimension} />
        <Picto icon={icon} />
      </div>
      <p className="mt-3 text-xs font-medium text-ink/60">{title}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${bad ? 'text-red-600' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-ink/50">{sub}</p>}
      {italic && <p className="text-xs italic text-ink/40">{italic}</p>}
    </div>
  );
}
