'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { loadPortalData, type PortalData } from '@/lib/data';

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

  const links = [
    // Le CFO et le CEO consultent toutes les navettes ; le métier n'a que la sienne.
    { href: '/navette', label: isLeader ? 'Navettes' : 'Ma navette', show: true },
    { href: '/dashboard', label: 'Consolidation', show: isLeader },
    { href: '/pilotage', label: 'Pilotage', show: true },
    { href: '/business-case', label: 'Business case', show: true },
    { href: '/diff', label: 'Versions', show: isLeader },
    { href: '/reglages', label: 'Réglages', show: role === 'cfo' },
  ].filter((l) => l.show);

  return (
    <header className="mx-auto w-full max-w-6xl px-4 pt-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-5 py-3 shadow-sm">
        <Link href="/" className="text-lg font-bold text-primary">
          Navette
        </Link>
        {data && (
          <span className="hidden border-l border-lav pl-4 text-sm text-ink/50 md:inline">
            {data.company.name} · budget {data.company.budget_year}
          </span>
        )}
        <nav className="ml-1 flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active ? 'bg-primary text-white' : 'text-ink hover:bg-card-soft'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
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
      <footer className="py-6 text-center text-xs text-ink/40">
        Navette : moteur de consolidation déterministe et testé, configuration en base, aucun chiffre rédigé par IA.
      </footer>
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
