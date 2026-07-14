'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { btnPrimary, inputBase } from '@/components/shell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError('Identifiants invalides.');
      return;
    }
    router.replace('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary">Navette</h1>
          <p className="mt-1 text-sm text-ink/60">
            Campagne budgétaire : chaque Head of construit sa navette, la finance consolide en continu.
          </p>
        </div>
        <label className="block text-sm">
          <span className="font-semibold text-ink">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 w-full text-left ${inputBase} bg-white`}
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-ink">Mot de passe</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1 w-full text-left ${inputBase} bg-white`}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
