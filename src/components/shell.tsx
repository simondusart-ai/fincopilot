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
  const pill = (active: boolean, enabled = true) =>
    `whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-primary text-white' : enabled ? 'text-ink hover:bg-card-soft' : 'text-ink/30'
    }`;

  return (
    <header className="mx-auto w-full max-w-6xl px-4 pt-4">
      {/* Header sur UNE ligne pour tous les roles : jamais de flex-wrap ; le groupe d'onglets
          scrolle horizontalement sous 1024 px plutot que de passer a la ligne. */}
      <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
        <Link href="/" aria-label="Navette, accueil" className="shrink-0">
          <Logo size="sm" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <nav className="flex shrink-0 items-center gap-0.5" aria-label="Étapes du processus">
            {steps.map((s, i) => {
              const active = pathname === s.href;
              return (
                <Fragment key={s.href}>
                  {i > 0 && <span className="px-0.5 text-ink/30" aria-hidden="true">›</span>}
                  {s.enabled ? (
                    <Link href={s.href} className={pill(active)}>
                      <span className="tabular-nums">{s.n}.</span> {s.label}
                    </Link>
                  ) : (
                    <span className={pill(false, false)} aria-disabled="true" title="Réservé à la direction">
                      <span className="tabular-nums">{s.n}.</span> {s.label}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </nav>
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-lav sm:block" aria-hidden="true" />
          <nav className="flex shrink-0 items-center gap-0.5" aria-label="Outils">
            {support.map((l) => (
              <Link key={l.href} href={l.href} className={pill(pathname === l.href)}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {data && (
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold text-ink">{data.profile.full_name}</span>
              <span className="block text-xs text-ink/50">{roleLabel}</span>
            </span>
          )}
          <button
            onClick={async () => {
              await getSupabase().auth.signOut();
              router.replace('/login');
            }}
            className={btnSecondary}
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
