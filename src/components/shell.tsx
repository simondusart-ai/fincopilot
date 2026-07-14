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

export function Header({ data }: { data: PortalData | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = data?.profile.role;

  const links = [
    { href: '/navette', label: 'Ma navette', show: true },
    { href: '/dashboard', label: 'Consolidation', show: role === 'cfo' },
    { href: '/diff', label: 'Versions', show: role === 'cfo' },
    { href: '/reglages', label: 'Réglages', show: role === 'cfo' },
  ].filter((l) => l.show);

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <Link href="/" className="text-lg font-semibold text-indigo-700">
          Navette
        </Link>
        {data && (
          <span className="text-sm text-slate-500">
            {data.company.name} · budget {data.company.budget_year}
          </span>
        )}
        <nav className="flex gap-4 ml-auto items-center">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm ${pathname === l.href ? 'text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {l.label}
            </Link>
          ))}
          {data && (
            <span className="text-sm text-slate-400 hidden sm:inline">
              {data.profile.full_name} ({data.profile.role === 'cfo' ? 'CFO' : 'Head of'})
            </span>
          )}
          <button
            onClick={async () => {
              await getSupabase().auth.signOut();
              router.replace('/login');
            }}
            className="text-sm text-slate-500 hover:text-slate-900 border border-slate-300 rounded px-2 py-1"
          >
            Déconnexion
          </button>
        </nav>
      </div>
    </header>
  );
}

export function Page({ data, children }: { data: PortalData | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header data={data} />
      <main className="mx-auto max-w-6xl w-full px-4 py-6 flex-1">{children}</main>
      <footer className="text-center text-xs text-slate-400 py-4">
        Navette : moteur de consolidation déterministe et testé, configuration en base, aucun chiffre rédigé par IA.
      </footer>
    </div>
  );
}

export function Loading() {
  return <p className="text-slate-500 py-12 text-center">Chargement...</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="border border-red-300 bg-red-50 text-red-800 rounded p-4 text-sm">{message}</div>
  );
}

export function Card({ title, value, hint, tone = 'default' }: { title: string; value: string; hint?: string; tone?: 'default' | 'bad' | 'good' }) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
