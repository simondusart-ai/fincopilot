import { Badge } from '@/components/shell';
import type { SubmissionRow, SubmissionStatusRow } from '@/lib/data';

/**
 * Carte de statut de navette pour l'écran Consolidation.
 * Purement présentationnel : tout vient des données déjà chargées par la page.
 *
 * Pictos : tracés à la main en SVG inline (aucune librairie d'icônes), trait fin
 * violet et pastille menthe strictement décorative. Le mapping se fait par code de
 * département, avec un dossier par défaut : l'outil reste générique pour toute société.
 */

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'var(--color-primary)',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const MINT = 'var(--color-mint)';

/** Picto par code de département. Toute valeur inconnue retombe sur le dossier. */
function DepartmentIcon({ code }: { code: string }) {
  const common = { width: 22, height: 22, ...ICON_PROPS, 'aria-hidden': true } as const;
  switch (code.toUpperCase()) {
    case 'TEC': // Tech & Product : chevrons de code
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="1.6" fill={MINT} stroke="none" />
          <polyline points="9 7.5 4.5 12 9 16.5" />
          <polyline points="15 7.5 19.5 12 15 16.5" />
        </svg>
      );
    case 'SAL': // Sales : stylo signature
      return (
        <svg {...common}>
          <circle cx="5.5" cy="18.5" r="1.7" fill={MINT} stroke="none" />
          <path d="M5 19l1.4-4.2L15 6.2a2 2 0 0 1 2.8 2.8L9.2 17.6 5 19z" />
          <path d="M14.2 7l2.8 2.8" />
        </svg>
      );
    case 'GRW': // Growth : fusée
      return (
        <svg {...common}>
          <circle cx="12" cy="19.5" r="1.7" fill={MINT} stroke="none" />
          <path d="M12 3c2.4 2 3.8 4.9 3.8 8.2L12 14.6l-3.8-3.4C8.2 7.9 9.6 5 12 3z" />
          <circle cx="12" cy="9" r="1.3" />
          <path d="M8.4 12.4L6.5 16l2.8-1" />
          <path d="M15.6 12.4L17.5 16l-2.8-1" />
        </svg>
      );
    case 'OPS': // Ops / CS : casque micro
      return (
        <svg {...common}>
          <circle cx="12.5" cy="20.5" r="1.7" fill={MINT} stroke="none" />
          <path d="M5 13.5v-1.2a7 7 0 0 1 14 0v1.2" />
          <rect x="3.2" y="13" width="3.6" height="5.2" rx="1.8" />
          <rect x="17.2" y="13" width="3.6" height="5.2" rx="1.8" />
          <path d="M19 18.2v.6a2 2 0 0 1-2 2h-2.7" />
        </svg>
      );
    case 'FAP': // FA&P : balance
      return (
        <svg {...common}>
          <circle cx="12" cy="4" r="1.7" fill={MINT} stroke="none" />
          <path d="M12 6v13M7.5 19.5h9" />
          <path d="M4.5 8.5h15" />
          <path d="M4.5 8.5L2.3 13.2h4.4L4.5 8.5z" />
          <path d="M19.5 8.5l-2.2 4.7h4.4l-2.2-4.7z" />
        </svg>
      );
    default: // Dossier : société inconnue ou nouveau département
      return (
        <svg {...common}>
          <circle cx="18" cy="16.5" r="1.7" fill={MINT} stroke="none" />
          <path d="M3.5 7a2 2 0 0 1 2-2h3.3l2 2h7.7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z" />
        </svg>
      );
  }
}

/** Badge d'état d'une navette. Vocabulaire partagé avec la timeline de l'écran navette. */
export function SubmissionStatusBadge({ status }: { status: SubmissionStatusRow }) {
  switch (status) {
    case 'draft':
      return <Badge tone="lav">Brouillon</Badge>;
    case 'submitted':
      return <Badge tone="accent">Soumise</Badge>;
    case 'approved':
      return <Badge tone="muted" dot="mint">Validée</Badge>;
    case 'rejected':
      return <Badge tone="danger">Renvoyée</Badge>;
  }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

/**
 * @param submission dernière version du département, quel que soit son statut.
 *                   null si le département n'a transmis aucune navette.
 */
export function NavetteStatusCard({
  code,
  name,
  submission,
}: {
  code: string;
  name: string;
  submission: SubmissionRow | null;
}) {
  // Date affichée : dernier événement connu.
  const date = submission ? submission.decided_at ?? submission.submitted_at ?? submission.created_at : null;
  const when = date ? fmtDate(date) : '';

  let line = 'Aucune version transmise';
  if (submission) {
    const v = `v${submission.version}`;
    if (submission.status === 'draft') line = `${v} en cours, non soumise`;
    else if (submission.status === 'submitted') line = `${v} soumise le ${when}`;
    else if (submission.status === 'approved') line = `${v} validée le ${when}`;
    else line = `${v} renvoyée le ${when}`;
  }

  const note = submission?.status === 'rejected' ? submission.decision_note : null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lav ${
            submission ? '' : 'opacity-50 grayscale'
          }`}
        >
          <DepartmentIcon code={code} />
        </span>
        <span className="truncate font-semibold text-ink" title={name}>
          {name}
        </span>
      </div>

      <div className="mt-3">
        {submission ? <SubmissionStatusBadge status={submission.status} /> : <Badge tone="danger">Aucune navette</Badge>}
      </div>

      <p className="mt-2 truncate text-xs text-ink/50" title={line}>
        {line}
      </p>
      {note && (
        <p className="truncate text-xs text-ink/50" title={note}>
          Motif : {note}
        </p>
      )}
    </div>
  );
}
