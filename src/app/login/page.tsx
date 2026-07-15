'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { btnPrimary, inputBase } from '@/components/shell';
import { Logo } from '@/components/logo';

/**
 * Illustration du volet droit, recreee en SVG inline simplifie d'apres la maquette :
 * un grand aplat lavande organique, une navette (fusee) qui file en haut a droite le long
 * d'une trajectoire pointillee, quelques orbes menthe, et une carte tableau de bord stylisee.
 * Purement decorative (aria-hidden) ; toutes les couleurs viennent des tokens de charte.
 */
function RightIllustration() {
  return (
    <svg viewBox="0 0 720 900" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Grand aplat lavande organique */}
      <circle cx="380" cy="360" r="330" fill="var(--color-lav)" />

      {/* Carte tableau de bord stylisee (barres de navette) */}
      <g>
        <rect x="452" y="196" width="184" height="188" rx="22" fill="white" />
        <rect x="482" y="228" width="116" height="24" rx="12" fill="var(--color-primary)" />
        <rect x="482" y="266" width="66" height="20" rx="10" fill="var(--color-mint)" />
        <rect x="482" y="300" width="96" height="24" rx="12" fill="var(--color-accent)" />
        <rect x="482" y="338" width="124" height="18" rx="9" fill="var(--color-lav)" />
        <circle cx="470" cy="352" r="3" fill="var(--color-lav)" />
        <circle cx="470" cy="338" r="3" fill="var(--color-lav)" />
        <circle cx="470" cy="366" r="3" fill="var(--color-lav)" />
      </g>

      {/* Trajectoire pointillee de la navette */}
      <path d="M300,470 L452,300" fill="none" stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 16" />

      {/* Orbes et accents */}
      <circle cx="392" cy="372" r="18" fill="var(--color-mint)" />
      <circle cx="392" cy="372" r="7" fill="var(--color-primary)" />
      <circle cx="436" cy="322" r="10" fill="var(--color-mint)" />
      <circle cx="268" cy="286" r="13" fill="none" stroke="var(--color-primary)" strokeWidth="4" />
      <circle cx="330" cy="560" r="8" fill="var(--color-mint)" />
      <circle cx="520" cy="470" r="7" fill="var(--color-mint)" />
      <circle cx="250" cy="430" r="6" fill="var(--color-mint)" />

      {/* Navette (fusee) filant vers le haut a droite */}
      <g transform="translate(250,486) rotate(42)">
        <path d="M0,-46 C15,-46 20,-14 20,12 L20,40 L-20,40 L-20,12 C-20,-14 -15,-46 0,-46 Z" fill="white" />
        <circle cx="0" cy="-8" r="9" fill="var(--color-mint)" />
        <path d="M-20,24 L-40,46 L-20,42 Z" fill="var(--color-primary)" />
        <path d="M20,24 L40,46 L20,42 Z" fill="var(--color-primary)" />
        <path d="M-11,40 L0,60 L11,40 Z" fill="var(--color-accent)" />
      </g>
    </svg>
  );
}

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
    // Fond lavande sur ecran etroit (le formulaire se centre en carte blanche) ;
    // moitie blanche a partir de lg, le volet illustration prenant l'autre moitie.
    <div className="flex min-h-screen bg-page lg:bg-white">
      {/* Volet gauche : formulaire */}
      <div className="flex w-full items-center justify-center px-4 py-10 lg:w-1/2 lg:justify-start lg:px-16">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
          <Logo size="lg" />

          <h1 className="mt-8 text-4xl font-bold leading-tight text-ink sm:text-5xl lg:text-6xl">Bonne campagne !</h1>
          <p className="mt-3 text-base text-ink/60">Connectez-vous pour accéder à la campagne budgétaire.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm">
              <span className="font-semibold text-ink">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@entreprise.fr"
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
                placeholder="Votre mot de passe"
                className={`mt-1 w-full text-left ${inputBase} bg-white`}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {busy ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-card-soft px-4 py-3">
            <p className="text-sm font-semibold text-ink">Pas encore d&apos;accès ?</p>
            <p className="text-sm text-ink/60">Les comptes sont créés par l&apos;équipe finance.</p>
          </div>
        </div>
      </div>

      {/* Volet droit : illustration, masque en dessous de lg */}
      <div className="relative hidden w-1/2 overflow-hidden bg-page lg:block">
        <RightIllustration />
      </div>
    </div>
  );
}
