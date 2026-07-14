'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

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
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-lg p-8 w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-indigo-700">Navette</h1>
          <p className="text-sm text-slate-500 mt-1">
            Campagne budgétaire : chaque Head of construit sa navette, la finance consolide en continu.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Mot de passe</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-indigo-700 text-white rounded py-2 font-medium hover:bg-indigo-800 disabled:opacity-50"
        >
          {busy ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
