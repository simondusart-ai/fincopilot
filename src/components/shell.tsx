'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { loadPortalData, type PortalData } from '@/lib/data';
import { Logo } from '@/components/logo';

export function usePortalData() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await getSupabase().auth.getSession();
      if (!session.session) {
        router.replace('/login');
        return;
      }
      setData(await loadPortalData());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Deux seuls styles de bouton de l'application (cf. charte). */
export const btnPrimary =
  'inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center rounded-full border border-lav bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-card-soft disabled:opacity-50';

/** Champ de saisie standard, coins arrondis, tokens de charte. */
export const inputBase =
  'rounded-xl border border-lav bg-card-soft px-3 py-2 text-ink tabular-nums outline-none transition-colors focus:border-primary disabled:bg-page disabled:text-ink/50';

type BadgeTone = 'accent' | 'muted' | 'lav' | 'peach' | 'danger';

/** Pastille de statut : pill blanche à bordure lavande, texte en majuscules. */
export function Badge({
  children,
  tone = 'accent',
  dot,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: 'mint' | 'red';
}) {
  const tones: Record<BadgeTone, string> = {
    accent: 'bg-white border border-lav text-accent',
    muted: 'bg-white border border-lav text-ink',
    lav: 'bg-lav border border-lav text-ink',
    peach: 'bg-peach border border-peach text-ink',
    danger: 'bg-red-50 border border-red-200 text-red-700',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot === 'mint' ? 'bg-mint' : 'bg-red-500'}`} />}
      {children}
    </span>
  );
}

export function Header({ data }: { data: PortalData | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = data?.profile.role;
  const isLeader = role === 'cfo' || role === 'ceo';
  const dept = data?.departments.find((d) => d.id === data?.profile.department_id);
  const roleLabel = role === 'cfo' ? 'CFO' : role === 'ceo' ? 'CEO' : dept ? `Head of ${dept.name}` : 'Head of';

  // Les trois etapes du processus. Le Budget est reserve a la direction : pour un Head of,
  // l'etape reste visible mais desactivee (la numerotation 1-2-3 reste lisible).
  const steps = [
    { n: 1, href: '/navette', label: isLeader ? 'Navettes' : 'Ma navette', enabled: true },
    { n: 2, href: '/dashboard', label: 'Budget', enabled: isLeader },
    { n: 3, href: '/pilotage', label: 'Pilotage', enabled: true },
  ];
  // Onglets support, hors processus. Diff retire de la nav (accessible depuis Ma navette).
  const support = [
    { href: '/business-case', label: 'Business case', show: true },
    { href: '/reglages', label: 'Réglages', show: role === 'cfo' },
  ].filter((l) => l.show);
  // Etape active detectee par l'URL. Les etapes avant sont "cochees", celles apres "a venir".
  const activeIndex = steps.findIndex((s) => pathname === s.href);
  // Base commune d'une etape du stepper (toujours sur une ligne).
  const stepBase = 'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors';
  const circleBase = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold';

  return (
    <header className="mx-auto w-full max-w-6xl px-4 pt-4">
      {/* Barre globale : blanche, radius genereux, ombre legere, sur le fond de page.
          Une seule ligne pour tous les roles ; le groupe logo + stepper scrolle
          horizontalement en largeur reduite plutot que de wrapper ou de chevaucher. */}
      <div className="flex items-center gap-4 rounded-3xl bg-white px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          <Link href="/" aria-label="Navette, accueil" className="shrink-0">
            <Logo size="sm" />
          </Link>
          {/* Stepper : les trois etapes du parcours dans un conteneur pill clair. */}
          <nav className="flex shrink-0 items-center gap-0.5 rounded-full bg-card-soft p-1" aria-label="Étapes du processus">
            {steps.map((s, i) => {
              const active = pathname === s.href;
              const state = !s.enabled ? 'disabled' : active ? 'active' : activeIndex >= 0 && i < activeIndex ? 'before' : 'after';
              const inner = (
                <>
                  {state === 'before' ? (
                    <span className={`${circleBase} bg-mint text-ink`}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                  ) : state === 'active' ? (
                    <span className={`${circleBase} bg-white/20 text-white`}>{s.n}</span>
                  ) : (
                    <span className={`${circleBase} border border-lav bg-white text-ink/50`}>{s.n}</span>
                  )}
                  <span className={state === 'active' ? 'font-bold text-white' : 'font-medium text-ink'}>{s.label}</span>
                </>
              );
              return (
                <Fragment key={s.href}>
                  {i > 0 && <span className="px-1 text-ink/30" aria-hidden="true">›</span>}
                  {state === 'disabled' ? (
                    <span className={`${stepBase} cursor-default font-medium text-ink opacity-50`} aria-disabled="true" title="Réservé à la direction">
                      {inner}
                    </span>
                  ) : state === 'active' ? (
                    <Link href={s.href} className={`${stepBase} bg-primary hover:bg-accent`}>{inner}</Link>
                  ) : (
                    <Link href={s.href} className={`${stepBase} hover:bg-lav`}>{inner}</Link>
                  )}
                </Fragment>
              );
            })}
          </nav>
        </div>

        {/* Bloc de droite : liens secondaires, identite, deconnexion. */}
        <div className="flex shrink-0 items-center gap-4">
          <nav className="flex items-center gap-1" aria-label="Outils">
            {support.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-card-soft ${pathname === l.href ? 'bg-card-soft' : ''}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {data && (
            <div className="hidden flex-col items-end leading-tight sm:flex">
              <span className="whitespace-nowrap text-sm font-bold text-ink">{data.profile.full_name}</span>
              <span className="whitespace-nowrap text-xs text-ink/50">{roleLabel}</span>
            </div>
          )}
          <button
            onClick={async () => {
              await getSupabase().auth.signOut();
              router.replace('/login');
            }}
            className="whitespace-nowrap rounded-full border border-primary bg-white px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}

export function Page({ data, children }: { data: PortalData | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header data={data} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

export function Loading() {
  return <p className="py-12 text-center text-ink/50">Chargement...</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
  );
}

export function Card({
  title,
  value,
  hint,
  tone = 'default',
  dot = false,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'bad' | 'good';
  dot?: boolean;
}) {
  // Charte : texte noir partout, rouge sobre reserve aux negatifs. Le vert n'existe pas en texte.
  const valueColor = tone === 'bad' ? 'text-red-600' : 'text-ink';
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{title}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueColor}`}>
        {value}
        {dot && <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-mint align-middle" />}
      </p>
      {hint && <p className="mt-2 text-xs leading-snug text-ink/50">{hint}</p>}
    </div>
  );
}
