'use client';

import { useEffect, useState } from 'react';
import { Card, ErrorBox, Loading, Page, usePortalData } from '@/components/shell';
import { getSupabase } from '@/lib/supabase';

/**
 * Réglages CFO : la configuration société vit en base, jamais dans le code.
 * Modifier un plafond ou une enveloppe ici change immédiatement les alertes de consolidation.
 */
export default function ReglagesPage() {
  const { data, error, loading, reload } = usePortalData();
  const [company, setCompany] = useState<Record<string, string>>({});
  const [envelopes, setEnvelopes] = useState<Record<string, string>>({});
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setCompany({
      opening_cash: String(data.company.opening_cash),
      opening_mrr: String(data.company.opening_mrr),
      arpa: String(data.company.arpa),
      gross_margin_pct: String(Number(data.company.gross_margin_pct) * 100),
      monthly_churn_pct: String(Number(data.company.monthly_churn_pct) * 100),
      runway_vigilance_months: String(data.company.runway_vigilance_months),
      runway_freeze_months: String(data.company.runway_freeze_months),
      payback_cap_months: data.company.payback_cap_months != null ? String(data.company.payback_cap_months) : '',
    });
    setEnvelopes(Object.fromEntries(data.departments.map((d) => [d.id, d.envelope != null ? String(d.envelope) : ''])));
    setCaps(Object.fromEntries(data.channels.map((c) => [c.id, c.cac_cap != null ? String(c.cac_cap) : ''])));
  }, [data]);

  if (loading) return <Page data={null}><Loading /></Page>;
  if (error || !data) return <Page data={null}><ErrorBox message={error ?? 'Erreur inconnue.'} /></Page>;
  if (data.profile.role !== 'cfo') {
    return <Page data={data}><ErrorBox message="Réservé au CFO." /></Page>;
  }

  const supabase = getSupabase();

  async function saveAll() {
    setBusy(true);
    setMessage(null);
    try {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      const gm = Number(company.gross_margin_pct) / 100;
      const churn = Number(company.monthly_churn_pct) / 100;
      if (!(gm > 0 && gm <= 1)) throw new Error('Marge brute : attendue entre 0 et 100 %.');
      if (!(churn >= 0 && churn < 1)) throw new Error('Churn mensuel : attendu entre 0 et 100 % exclu.');
      const { error: cErr } = await supabase
        .from('companies')
        .update({
          opening_cash: Number(company.opening_cash),
          opening_mrr: Number(company.opening_mrr),
          arpa: Number(company.arpa),
          gross_margin_pct: gm,
          monthly_churn_pct: churn,
          runway_vigilance_months: Number(company.runway_vigilance_months),
          runway_freeze_months: Number(company.runway_freeze_months),
          payback_cap_months: num(company.payback_cap_months),
        })
        .eq('id', data!.company.id);
      if (cErr) throw new Error(cErr.message);

      for (const d of data!.departments) {
        const { error: dErr } = await supabase
          .from('departments')
          .update({ envelope: num(envelopes[d.id] ?? '') })
          .eq('id', d.id);
        if (dErr) throw new Error(dErr.message);
      }
      for (const c of data!.channels) {
        const { error: chErr } = await supabase
          .from('channels')
          .update({ cac_cap: num(caps[c.id] ?? '') })
          .eq('id', c.id);
        if (chErr) throw new Error(chErr.message);
      }
      setMessage('Réglages enregistrés : la consolidation reflète immédiatement le nouveau cadrage.');
      await reload();
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: string, hint?: string) => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={company[key] ?? ''}
        onChange={(e) => setCompany((prev) => ({ ...prev, [key]: e.target.value }))}
        className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );

  return (
    <Page data={data}>
      <h1 className="text-xl font-semibold">Réglages : cadrage {data.company.name}</h1>
      <p className="text-sm text-slate-500 mt-1">
        Toute la configuration société vit ici, pas dans le code : c'est ce qui rend l'outil réutilisable dans une autre entreprise.
      </p>

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="font-medium">Hypothèses société</h2>
          {field('Trésorerie d’ouverture (€)', 'opening_cash')}
          {field('MRR d’ouverture (€)', 'opening_mrr')}
          {field('ARPA (€ / mois)', 'arpa')}
          {field('Marge brute (%)', 'gross_margin_pct')}
          {field('Churn mensuel (%)', 'monthly_churn_pct')}
          {field('Seuil de vigilance runway (mois)', 'runway_vigilance_months')}
          {field('Seuil de gel runway (mois)', 'runway_freeze_months')}
          {field('Plafond payback brut (mois)', 'payback_cap_months', 'Vide = pas de plafond')}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="font-medium">Enveloppes par département (€ / an)</h2>
          {data.departments.map((d) => (
            <label key={d.id} className="block text-sm">
              <span className="text-slate-600">{d.name}{d.is_sales_marketing ? ' (S&M)' : ''}</span>
              <input
                type="text"
                inputMode="decimal"
                value={envelopes[d.id] ?? ''}
                onChange={(e) => setEnvelopes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                placeholder="Vide = pas d'enveloppe"
                className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
              />
            </label>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="font-medium">Plafonds de CAC par canal (€)</h2>
          {data.channels.length === 0 && <p className="text-sm text-slate-500">Aucun canal défini.</p>}
          {data.channels.map((c) => (
            <label key={c.id} className="block text-sm">
              <span className="text-slate-600">{c.name}</span>
              <input
                type="text"
                inputMode="decimal"
                value={caps[c.id] ?? ''}
                onChange={(e) => setCaps((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Vide = pas de plafond"
                className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
              />
            </label>
          ))}
          <Card
            title="Rappel"
            value="Alerte, jamais blocage"
            hint="Un dépassement de cadrage se consolide et se signale : c'est un objet d'arbitrage codir."
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={saveAll}
          disabled={busy}
          className="bg-indigo-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-800 disabled:opacity-50"
        >
          {busy ? 'Enregistrement...' : 'Enregistrer les réglages'}
        </button>
        {message && <p className="text-sm text-slate-600">{message}</p>}
      </div>
    </Page>
  );
}
