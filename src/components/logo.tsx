/**
 * Logo Navette, recree en SVG inline d'apres la maquette (docs/design/front.pdf) :
 * une tuile arrondie violette portant une navette (avion en papier) blanche, une pastille
 * menthe decorative, et le mot "navette" en Poppins gras minuscules. Aucun asset binaire,
 * aucune couleur en dur hors blanc : tout passe par les tokens de charte (var(--color-*)).
 *
 * Deux tailles (login en grand, header en petit) et deux fonds (clair : tuile violette /
 * mot violet ; sombre : tuile blanche / mot blanc, pour un eventuel fond violet).
 */
export function Logo({
  size = 'sm',
  tone = 'light',
}: {
  size?: 'sm' | 'lg';
  tone?: 'light' | 'dark';
}) {
  const dim = size === 'lg' ? 46 : 30;
  const wordClass = size === 'lg' ? 'text-3xl' : 'text-lg';
  const gap = size === 'lg' ? 'gap-3' : 'gap-2';
  const tileFill = tone === 'dark' ? 'white' : 'var(--color-primary)';
  const markFill = tone === 'dark' ? 'var(--color-primary)' : 'white';
  const wordColor = tone === 'dark' ? 'text-white' : 'text-primary';

  return (
    <span className={`inline-flex items-center ${gap}`}>
      <svg width={dim} height={dim} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <rect width="48" height="48" rx="14" fill={tileFill} />
        {/* Navette : avion en papier, legerement incline pour suggerer le vol. */}
        <g transform="rotate(-18 24 24)">
          <path d="M9,11 L40,24 L9,37 L9,27 L25,24 L9,21 Z" fill={markFill} />
        </g>
        {/* Pastille menthe decorative. */}
        <circle cx="37" cy="12" r="3" fill="var(--color-mint)" />
      </svg>
      <span className={`font-bold lowercase tracking-tight ${wordClass} ${wordColor}`}>navette</span>
    </span>
  );
}
