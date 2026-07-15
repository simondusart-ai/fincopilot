import type { Alert } from '@/lib/engine';
import { alertTitle } from '@/lib/alert-labels';

/** Petit picto d'alerte (triangle discret), trait fin. */
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * Une alerte de gestion : titre HUMAIN, message factuel, pill du mois ou trimestre concerne.
 * Le code technique reste en attribut title (survol), jamais affiche.
 */
export function AlertBanner({ alert, period, extraTag }: { alert: Alert; period?: string; extraTag?: string }) {
  return (
    <li title={alert.code} className="flex items-start gap-3 rounded-xl bg-peach px-4 py-3 text-sm text-ink">
      <span className="mt-0.5 shrink-0 text-ink/70">
        <WarnIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{alertTitle(alert.code)}</p>
        <p className="text-ink/70">{alert.message}</p>
      </div>
      {(extraTag || period) && (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {extraTag && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink">{extraTag}</span>}
          {period && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink">{period}</span>}
        </div>
      )}
    </li>
  );
}

/**
 * Liste des alertes de gestion, ou l'etat vide (pastille menthe decorative + message).
 * `periodFor` renvoie le libelle de periode (mois ou trimestre) d'une alerte, ou undefined.
 */
export function AlertBanners({
  alerts,
  emptyMessage,
  periodFor,
  extraTag,
}: {
  alerts: Alert[];
  emptyMessage: string;
  periodFor?: (a: Alert) => string | undefined;
  extraTag?: string;
}) {
  if (alerts.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-ink shadow-sm">
        <span className="h-2 w-2 shrink-0 rounded-full bg-mint" aria-hidden="true" />
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {alerts.map((a, i) => (
        <AlertBanner key={i} alert={a} period={periodFor?.(a)} extraTag={extraTag} />
      ))}
    </ul>
  );
}
