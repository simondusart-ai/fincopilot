'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

/** Aiguillage : CFO vers la consolidation, Head of vers sa navette. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', session.session.user.id)
        .single();
      router.replace(profile?.role === 'cfo' ? '/dashboard' : '/navette');
    })();
  }, [router]);
  return <p className="py-12 text-center text-ink/50">Chargement...</p>;
}
