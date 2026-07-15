/**
 * Navette : moteur des indicateurs realises (actuals), pilotage mensuel.
 * Module pur : aucune dependance a Supabase, au front ou au reseau.
 * Montants en euros, pourcentages en fractions (0.70 = 70 %).
 *
 * Regles :
 * - alertes de gestion uniquement, jamais bloquantes ;
 * - une donnee manquante produit un resultat null (case vide), jamais une erreur ;
 * - toute division par zero renvoie null.
 */

import type { Alert } from './types';

export interface ActualsParams {
  arpa: number;
  grossMarginPct: number;
  /** Base clients au premier mois de la serie fournie (roll-forward ancre ici). */
  openingClients: number;
  runwayVigilanceMonths: number;
  runwayFreezeMonths: number;
  /** Cible de CAC moyen charge, en euros. null = pas de cible. */
  cacAvgTarget: number | null;
  channels: { id: string; name: string; cacCap: number | null }[];
}

/** Une ligne de saisie mensuelle (table monthly_actuals). Montants en euros. */
export interface ActualMonthInput {
  month: number; // 1 a 12
  newClients: number;
  churnedClients: number;
  mrrEnd: number;
  /** Chiffre d'affaires du mois si connu, sinon null (on retombe sur mrrEnd). */
  revenueMonth: number | null;
  smSpend: number;
  /** Tresorerie de fin de mois si connue, sinon null. */
  cashEnd: number | null;
  /** NRR mesure (fraction) si disponible, sinon null (proxy calcule). */
  nrrMeasured: number | null;
}

/** Une ligne de detail canal (table channel_actuals). */
export interface ChannelActualInput {
  channelId: string;
  month: number;
  spend: number;
  newCustomers: number;
}

export interface ChannelCacCell {
  channelId: string;
  name: string;
  month: number;
  spend: number;
  newCustomers: number;
  /** CAC du canal sur le mois. null si aucun nouveau client. */
  cac: number | null;
  cacCap: number | null;
}

export interface ActualMonthResult {
  month: number;
  baseOpen: number;
  baseEnd: number;
  newClients: number;
  churnedClients: number;
  netAdds: number;
  /** Churn logo mensuel = churnes / base d'ouverture. null si base nulle. */
  monthlyLogoChurn: number | null;
  /** ARPA implicite = mrrEnd / baseEnd. null si base nulle. */
  arpaImplicit: number | null;
  mrrEnd: number;
  /** Croissance du MRR vs mois precedent de la serie. null si indisponible. */
  mrrGrowthMoM: number | null;
  /** Croissance du MRR vs meme mois de l'annee precedente. null si indisponible. */
  mrrGrowthYoY: number | null;
  /** NRR : mesure si saisi, sinon proxy annualise. null si non calculable. */
  nrr: number | null;
  nrrIsProxy: boolean;
  /** CAC moyen charge = smSpend / newClients. null si aucun nouveau client. */
  cacAvg: number | null;
  /** Marge de contribution % = (revenu x grossMarginPct - smSpend) / revenu. */
  contributionMarginPct: number | null;
  /** Burn = cashEnd - cashEnd du mois precedent (negatif = consommation). null si indisponible. */
  burn: number | null;
  /** Runway = cashEnd / consommation du dernier mois. null si pas de consommation. */
  runwayMonths: number | null;
  smSpend: number;
  cashEnd: number | null;
  /** Revenu retenu = revenueMonth si saisi, sinon mrrEnd. */
  revenue: number;
}

export interface ActualsResult {
  months: ActualMonthResult[];
  channels: ChannelCacCell[];
  alerts: Alert[];
  /** Base clients apres le dernier mois saisi (chainage inter-annees). null si aucun mois. */
  endBaseClients: number | null;
}

/**
 * Calcule les indicateurs realises d'une annee.
 * @param prevYearMonths mois de l'annee precedente, pour la croissance MRR vs n-1 (optionnel).
 */
export function computeActuals(
  params: ActualsParams,
  months: ActualMonthInput[],
  channelActuals: ChannelActualInput[],
  prevYearMonths: ActualMonthInput[] = [],
): ActualsResult {
  const sorted = [...months].sort((a, b) => a.month - b.month);
  const prevByMonth = new Map(prevYearMonths.map((m) => [m.month, m]));
  const decPrevYear = prevByMonth.get(12) ?? null;

  const results: ActualMonthResult[] = [];
  const alerts: Alert[] = [];

  let prevBaseEnd: number | null = null;
  let prevMrrEnd: number | null = null;
  let prevCashEnd: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];

    // Base clients : roll-forward ancre sur openingClients au premier mois.
    const baseOpen: number = prevBaseEnd === null ? params.openingClients : prevBaseEnd;
    const baseEnd: number = baseOpen + m.newClients - m.churnedClients;
    const netAdds = m.newClients - m.churnedClients;
    const monthlyLogoChurn = baseOpen > 0 ? m.churnedClients / baseOpen : null;
    const arpaImplicit = baseEnd > 0 ? m.mrrEnd / baseEnd : null;

    const mrrGrowthMoM = prevMrrEnd !== null && prevMrrEnd > 0 ? m.mrrEnd / prevMrrEnd - 1 : null;
    const prevYearSame = prevByMonth.get(m.month);
    const mrrGrowthYoY = prevYearSame && prevYearSame.mrrEnd > 0 ? m.mrrEnd / prevYearSame.mrrEnd - 1 : null;

    // MRR d'ouverture du mois = MRR de fin du mois precedent (ou dec n-1 au premier mois).
    const mrrOpen = i > 0 ? sorted[i - 1].mrrEnd : decPrevYear?.mrrEnd ?? null;

    // NRR : mesure si saisi, sinon proxy annualise (approximation, cf. DOCUMENTATION.md).
    let nrr: number | null;
    let nrrIsProxy: boolean;
    if (m.nrrMeasured !== null) {
      nrr = m.nrrMeasured;
      nrrIsProxy = false;
    } else if (mrrOpen !== null && mrrOpen > 0 && arpaImplicit !== null) {
      const retained = (m.mrrEnd - m.newClients * arpaImplicit) / mrrOpen;
      nrr = retained > 0 ? Math.pow(retained, 12) : null;
      nrrIsProxy = true;
    } else {
      nrr = null;
      nrrIsProxy = false;
    }

    const cacAvg = m.newClients > 0 ? m.smSpend / m.newClients : null;

    const revenue = m.revenueMonth ?? m.mrrEnd;
    const contributionMarginPct = revenue > 0 ? (revenue * params.grossMarginPct - m.smSpend) / revenue : null;

    // Burn du mois et runway (convention : burn du dernier mois disponible).
    const burn = m.cashEnd !== null && prevCashEnd !== null ? m.cashEnd - prevCashEnd : null;
    let runwayMonths: number | null = null;
    if (m.cashEnd !== null && burn !== null && burn < 0) {
      const consumption = -burn;
      runwayMonths = consumption > 0 ? m.cashEnd / consumption : null;
    }

    results.push({
      month: m.month,
      baseOpen,
      baseEnd,
      newClients: m.newClients,
      churnedClients: m.churnedClients,
      netAdds,
      monthlyLogoChurn,
      arpaImplicit,
      mrrEnd: m.mrrEnd,
      mrrGrowthMoM,
      mrrGrowthYoY,
      nrr,
      nrrIsProxy,
      cacAvg,
      contributionMarginPct,
      burn,
      runwayMonths,
      smSpend: m.smSpend,
      cashEnd: m.cashEnd,
      revenue,
    });

    // Alertes de gestion (jamais bloquantes).
    if (cacAvg !== null && params.cacAvgTarget !== null && cacAvg > params.cacAvgTarget) {
      alerts.push({
        severity: 'alerte',
        code: 'CAC_MOYEN_CIBLE',
        month: m.month,
        message: `Mois ${m.month} : CAC moyen charge de ${Math.round(cacAvg)} EUR au-dessus de la cible de ${Math.round(params.cacAvgTarget)} EUR.`,
      });
    }
    if (runwayMonths !== null && runwayMonths < params.runwayFreezeMonths) {
      alerts.push({
        severity: 'alerte',
        code: 'RUNWAY_GEL',
        month: m.month,
        message: `Mois ${m.month} : runway de ${runwayMonths.toFixed(1)} mois sous le seuil de gel de ${params.runwayFreezeMonths} mois.`,
      });
    } else if (runwayMonths !== null && runwayMonths < params.runwayVigilanceMonths) {
      alerts.push({
        severity: 'alerte',
        code: 'RUNWAY_VIGILANCE',
        month: m.month,
        message: `Mois ${m.month} : runway de ${runwayMonths.toFixed(1)} mois sous le seuil de vigilance de ${params.runwayVigilanceMonths} mois.`,
      });
    }

    prevBaseEnd = baseEnd;
    prevMrrEnd = m.mrrEnd;
    if (m.cashEnd !== null) prevCashEnd = m.cashEnd;
  }

  // Detail des canaux : CAC = depenses / nouveaux clients, compare au plafond.
  const channelById = new Map(params.channels.map((c) => [c.id, c]));
  const channels: ChannelCacCell[] = [...channelActuals]
    .sort((a, b) => a.month - b.month || a.channelId.localeCompare(b.channelId))
    .map((ca) => {
      const ch = channelById.get(ca.channelId);
      const cac = ca.newCustomers > 0 ? ca.spend / ca.newCustomers : null;
      const cacCap = ch?.cacCap ?? null;
      if (cac !== null && cacCap !== null && cac > cacCap) {
        alerts.push({
          severity: 'alerte',
          code: 'CAC_PLAFOND',
          channelId: ca.channelId,
          month: ca.month,
          message: `Canal ${ch?.name ?? ca.channelId}, mois ${ca.month} : CAC de ${Math.round(cac)} EUR au-dessus du plafond de ${Math.round(cacCap)} EUR.`,
        });
      }
      return {
        channelId: ca.channelId,
        name: ch?.name ?? ca.channelId,
        month: ca.month,
        spend: ca.spend,
        newCustomers: ca.newCustomers,
        cac,
        cacCap,
      };
    });

  return {
    months: results,
    channels,
    alerts,
    endBaseClients: prevBaseEnd,
  };
}
