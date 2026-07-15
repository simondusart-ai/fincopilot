import { monthlyizeByFrequency, monthlyizeFlow, monthlyizeLevel, sum } from './monthlyize';
import { validateInputs } from './validate';
import { isInlineLine } from './types';
import type {
  Alert,
  ChannelQuarterRow,
  ConsolidationInputs,
  ConsolidationResult,
  ConsolidationTotals,
  DeptRow,
  MonthRow,
} from './types';

/** Formate un montant en k€ pour les messages d'alerte. */
export function fmtK(eur: number): string {
  return `${Math.round(eur / 1000).toLocaleString('fr-FR')} k€`;
}

/**
 * Consolide les navettes soumises en P&L mensuel de l'année budgétée.
 *
 * Conventions documentées (voir docs/DOCUMENTATION.md, section Conventions de calcul) :
 * - revenu du mois = MRR de fin de mois (roll-forward : MRR ouvert + ajouts + expansion - churn) ;
 * - le churn mensuel s'applique au MRR d'ouverture du mois ;
 * - les coûts des départements sont supposés hors coût des ventes : la marge brute
 *   est calculée par le taux de la config, l'EBITDA = marge brute - coûts départements ;
 * - le capex est exclu de l'EBITDA et de la marge de contribution, mais il compte dans
 *   l'enveloppe du département et se déduit de la trésorerie le mois où il tombe ;
 * - flux de trésorerie du mois = EBITDA - capex (pas de variation de BFR modélisée) ;
 * - runway du mois = trésorerie / flux de trésorerie moyen des 3 derniers mois (null si pas de burn).
 */
export function consolidate(inputs: ConsolidationInputs): ConsolidationResult {
  const blocking = validateInputs(inputs);
  if (blocking.length > 0) {
    return {
      ok: false,
      blocking,
      warnings: [],
      months: [],
      departments: [],
      channelQuarters: [],
      totals: null,
    };
  }

  const { config, departments, driverDefs, channels, submissions } = inputs;
  const defById = new Map(driverDefs.map((d) => [d.id, d]));
  const warnings: Alert[] = [];

  // Agrégats mensuels (12 valeurs chacun)
  const newMrr = zeros();
  const expansionMrr = zeros();
  const otherRevenue = zeros();
  const payroll = zeros();
  const opex = zeros();
  const cogs = zeros();
  const capex = zeros();
  /** true si la société déclare ses COGS en navettes : la marge brute devient revenu - COGS. */
  const hasCogs =
    driverDefs.some((d) => d.kind === 'cogs') ||
    submissions.some((s) => s.lines.some((l) => isInlineLine(l) && l.kind === 'cogs'));

  // Coûts mensuels par département : total (pour les enveloppes) et hors COGS (pour l'EBITDA)
  const deptCosts = new Map<string, number[]>(departments.map((d) => [d.id, zeros()]));
  const deptSgna = new Map<string, number[]>(departments.map((d) => [d.id, zeros()]));
  const deptMrrAdded = new Map<string, number>(departments.map((d) => [d.id, 0]));

  // Canaux : dépenses et nouveaux clients par trimestre
  const channelSpendQ = new Map<string, [number, number, number, number]>(channels.map((c) => [c.id, [0, 0, 0, 0]]));
  const channelCustomersQ = new Map<string, [number, number, number, number]>(channels.map((c) => [c.id, [0, 0, 0, 0]]));

  for (const sub of submissions) {
    const costs = deptCosts.get(sub.departmentId)!;
    const sgna = deptSgna.get(sub.departmentId)!;
    for (const line of sub.lines) {
      // Lignes libres : le type et la fréquence sont portés par la ligne elle-même.
      if (isInlineLine(line)) {
        const flow = monthlyizeByFrequency(line.q, line.frequency);
        switch (line.kind) {
          case 'payroll':
            for (let m = 0; m < 12; m++) {
              payroll[m] += flow[m];
              costs[m] += flow[m];
              sgna[m] += flow[m];
            }
            break;
          case 'opex':
            for (let m = 0; m < 12; m++) {
              opex[m] += flow[m];
              costs[m] += flow[m];
              sgna[m] += flow[m];
            }
            break;
          case 'capex':
            // Hors EBITDA et hors marge de contribution, mais dans l'enveloppe et la trésorerie.
            for (let m = 0; m < 12; m++) {
              capex[m] += flow[m];
              costs[m] += flow[m];
            }
            break;
          case 'cogs':
            for (let m = 0; m < 12; m++) {
              cogs[m] += flow[m];
              costs[m] += flow[m];
            }
            break;
          case 'revenue_other':
            for (let m = 0; m < 12; m++) otherRevenue[m] += flow[m];
            break;
          case 'new_mrr':
            for (let m = 0; m < 12; m++) newMrr[m] += flow[m];
            deptMrrAdded.set(sub.departmentId, deptMrrAdded.get(sub.departmentId)! + sum(line.q));
            break;
          case 'expansion_mrr':
            for (let m = 0; m < 12; m++) expansionMrr[m] += flow[m];
            deptMrrAdded.set(sub.departmentId, deptMrrAdded.get(sub.departmentId)! + sum(line.q));
            break;
          default:
            // headcount et canaux ne sont pas admis en ligne libre : contrôle bloquant amont.
            break;
        }
        continue;
      }

      const def = defById.get(line.driverDefId)!;
      const key = def.monthlyKey ? config.seasonalKeys?.[def.monthlyKey] : undefined;
      switch (def.kind) {
        case 'headcount': {
          const fte = monthlyizeLevel(line.q);
          for (let m = 0; m < 12; m++) {
            const cost = fte[m] * (line.unitCost ?? 0);
            payroll[m] += cost;
            costs[m] += cost;
            sgna[m] += cost;
          }
          break;
        }
        case 'payroll': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) {
            payroll[m] += flow[m];
            costs[m] += flow[m];
            sgna[m] += flow[m];
          }
          break;
        }
        case 'opex': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) {
            opex[m] += flow[m];
            costs[m] += flow[m];
            sgna[m] += flow[m];
          }
          break;
        }
        case 'cogs': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) {
            cogs[m] += flow[m];
            costs[m] += flow[m]; // compte dans l'enveloppe du département
          }
          break;
        }
        case 'capex': {
          // Hors EBITDA et hors marge de contribution (jamais dans sgna),
          // mais compte dans l'enveloppe et se déduit de la trésorerie.
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) {
            capex[m] += flow[m];
            costs[m] += flow[m];
          }
          break;
        }
        case 'revenue_other': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) otherRevenue[m] += flow[m];
          break;
        }
        case 'channel_spend': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) {
            opex[m] += flow[m];
            costs[m] += flow[m];
            sgna[m] += flow[m];
          }
          const spendQ = channelSpendQ.get(def.channelId!)!;
          for (let q = 0; q < 4; q++) spendQ[q] += line.q[q];
          break;
        }
        case 'channel_customers': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) newMrr[m] += flow[m] * config.arpa;
          const custQ = channelCustomersQ.get(def.channelId!)!;
          for (let q = 0; q < 4; q++) custQ[q] += line.q[q];
          deptMrrAdded.set(sub.departmentId, deptMrrAdded.get(sub.departmentId)! + sum(line.q) * config.arpa);
          break;
        }
        case 'new_mrr': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) newMrr[m] += flow[m];
          deptMrrAdded.set(sub.departmentId, deptMrrAdded.get(sub.departmentId)! + sum(line.q));
          break;
        }
        case 'expansion_mrr': {
          const flow = monthlyizeFlow(line.q, key);
          for (let m = 0; m < 12; m++) expansionMrr[m] += flow[m];
          deptMrrAdded.set(sub.departmentId, deptMrrAdded.get(sub.departmentId)! + sum(line.q));
          break;
        }
      }
    }
  }

  // Roll-forward MRR et P&L mensuel
  const smDeptIds = new Set(departments.filter((d) => d.isSalesMarketing).map((d) => d.id));
  const months: MonthRow[] = [];
  let mrrOpen = config.openingMrr;
  let cash = config.openingCash;
  /** Flux de trésorerie mensuels (EBITDA - capex), base du runway. */
  const cashFlowHistory: number[] = [];

  for (let m = 0; m < 12; m++) {
    const churnedMrr = mrrOpen * config.monthlyChurnPct;
    const mrrEnd = mrrOpen + newMrr[m] + expansionMrr[m] - churnedMrr;
    const revenue = mrrEnd + otherRevenue[m];
    const grossMargin = hasCogs ? revenue - cogs[m] : revenue * config.grossMarginPct;

    let smSpend = 0;
    let totalSgna = 0;
    let totalDeptCosts = 0;
    for (const [deptId, sgna] of deptSgna) {
      totalSgna += sgna[m];
      totalDeptCosts += deptCosts.get(deptId)![m];
      if (smDeptIds.has(deptId)) smSpend += sgna[m];
    }

    const contributionMargin = grossMargin - smSpend;
    // Les COGS sont déjà déduits dans la marge brute : l'EBITDA ne retranche que le hors COGS.
    // Le capex n'est pas dans sgna : il ne pèse ni sur l'EBITDA ni sur la marge de contribution.
    const ebitda = grossMargin - totalSgna;
    const cashFlow = ebitda - capex[m];
    cash += cashFlow;
    cashFlowHistory.push(cashFlow);

    const window = cashFlowHistory.slice(-3);
    const avgBurn = sum(window) / window.length;
    let runwayMonths: number | null;
    if (cash <= 0) runwayMonths = 0;
    else if (avgBurn >= 0) runwayMonths = null;
    else runwayMonths = cash / Math.abs(avgBurn);

    // Runway BRUT : tresorerie de fin de mois / decaissements du mois (tous les couts cash,
    // COGS + salaires + opex + canaux + capex, deja agreges dans totalDeptCosts). Aucun
    // encaissement pris en compte : stress test toujours fini quand il y a des decaissements.
    const grossRunwayMonths = totalDeptCosts > 0 ? cash / totalDeptCosts : null;

    const nrrAnnualized = mrrOpen > 0 ? Math.pow((mrrOpen + expansionMrr[m] - churnedMrr) / mrrOpen, 12) : null;

    months.push({
      month: m + 1,
      mrrOpen,
      newMrr: newMrr[m],
      expansionMrr: expansionMrr[m],
      churnedMrr,
      mrrEnd,
      otherRevenue: otherRevenue[m],
      revenue,
      cogsTotal: cogs[m],
      grossMargin,
      smSpend,
      contributionMargin,
      contributionMarginPct: revenue > 0 ? contributionMargin / revenue : null,
      payrollTotal: payroll[m],
      opexTotal: opex[m],
      totalDeptCosts,
      capexTotal: capex[m],
      ebitda,
      cash,
      runwayMonths,
      grossRunwayMonths,
      nrrAnnualized,
    });

    mrrOpen = mrrEnd;
  }

  // Lignes départements et alertes d'enveloppe
  const deptRows: DeptRow[] = departments.map((d) => {
    const monthlyCosts = deptCosts.get(d.id)!;
    const annualCost = sum(monthlyCosts);
    const overrun = d.envelope !== null && annualCost > d.envelope ? annualCost - d.envelope : null;
    if (overrun !== null) {
      warnings.push({
        severity: 'alerte',
        code: 'ENVELOPPE_DEPASSEE',
        departmentId: d.id,
        message: `${d.name} : coûts annuels de ${fmtK(annualCost)} pour une enveloppe de cadrage de ${fmtK(d.envelope!)}, soit un dépassement de ${fmtK(overrun)}. À arbitrer au codir.`,
      });
    }
    return {
      departmentId: d.id,
      code: d.code,
      name: d.name,
      monthlyCosts,
      annualCost,
      envelope: d.envelope,
      envelopeOverrun: overrun,
      annualMrrAdded: deptMrrAdded.get(d.id)!,
    };
  });

  // Canaux : CAC par trimestre et alertes de plafond
  const channelQuarters: ChannelQuarterRow[] = [];
  let totalSpend = 0;
  let totalCustomers = 0;
  for (const c of channels) {
    const spendQ = channelSpendQ.get(c.id)!;
    const custQ = channelCustomersQ.get(c.id)!;
    for (let q = 0; q < 4; q++) {
      const spend = spendQ[q];
      const customers = custQ[q];
      totalSpend += spend;
      totalCustomers += customers;
      const cac = customers > 0 ? spend / customers : null;
      channelQuarters.push({ channelId: c.id, name: c.name, quarter: q + 1, spend, newCustomers: customers, cac, cacCap: c.cacCap });
      if (spend > 0 && customers === 0) {
        warnings.push({
          severity: 'alerte',
          code: 'CAC_NON_CALCULABLE',
          channelId: c.id,
          quarter: q + 1,
          message: `Canal ${c.name}, T${q + 1} : ${fmtK(spend)} de dépenses sans aucun nouveau client prévu, CAC non calculable.`,
        });
      } else if (cac !== null && c.cacCap !== null && cac > c.cacCap) {
        warnings.push({
          severity: 'alerte',
          code: 'CAC_PLAFOND',
          channelId: c.id,
          quarter: q + 1,
          message: `Canal ${c.name}, T${q + 1} : CAC budgété de ${Math.round(cac)} € au-dessus du plafond de ${Math.round(c.cacCap)} €.`,
        });
      }
    }
  }

  // Alertes transversales : runway, trésorerie, NRR, payback
  const firstBelow = (threshold: number) => months.find((r) => r.runwayMonths !== null && r.runwayMonths < threshold);
  const freeze = firstBelow(config.runwayFreezeMonths);
  const vigilance = firstBelow(config.runwayVigilanceMonths);
  if (freeze) {
    warnings.push({
      severity: 'alerte',
      code: 'RUNWAY_GEL',
      month: freeze.month,
      message: `Runway budgété sous le seuil de gel de ${config.runwayFreezeMonths} mois dès le mois ${freeze.month} (${freeze.runwayMonths!.toFixed(1)} mois) : gel des engagements non contractualisés par défaut.`,
    });
  } else if (vigilance) {
    warnings.push({
      severity: 'alerte',
      code: 'RUNWAY_VIGILANCE',
      month: vigilance.month,
      message: `Runway budgété sous le seuil de vigilance de ${config.runwayVigilanceMonths} mois dès le mois ${vigilance.month} (${vigilance.runwayMonths!.toFixed(1)} mois).`,
    });
  }

  const negCash = months.find((r) => r.cash < 0);
  if (negCash) {
    warnings.push({
      severity: 'alerte',
      code: 'TRESORERIE_NEGATIVE',
      month: negCash.month,
      message: `Trésorerie budgétée négative dès le mois ${negCash.month} (${fmtK(negCash.cash)}) : le budget n'est pas finançable en l'état.`,
    });
  }

  const nrrBelow = months.filter((r) => r.nrrAnnualized !== null && r.nrrAnnualized < 1);
  if (nrrBelow.length > 0) {
    warnings.push({
      severity: 'alerte',
      code: 'NRR_SOUS_100',
      message: `NRR annualisé budgété sous 100 % sur ${nrrBelow.length} mois sur 12 (objectif codir : NRR supérieur à 100 %).`,
    });
  }

  const annualRevenue = sum(months.map((r) => r.revenue));
  const annualGrossMargin = sum(months.map((r) => r.grossMargin));
  /** Marge brute effective du budget : celle des navettes si COGS déclarés, sinon celle de la config. */
  const effectiveGrossMarginPct = annualRevenue > 0 ? annualGrossMargin / annualRevenue : null;
  const paybackMarginPct = effectiveGrossMarginPct ?? config.grossMarginPct;
  const blendedCac = totalCustomers > 0 ? totalSpend / totalCustomers : null;
  const grossPaybackMonths =
    blendedCac !== null && paybackMarginPct > 0 ? blendedCac / (config.arpa * paybackMarginPct) : null;
  if (grossPaybackMonths !== null && config.paybackCapMonths !== undefined && grossPaybackMonths > config.paybackCapMonths) {
    warnings.push({
      severity: 'alerte',
      code: 'PAYBACK_PLAFOND',
      message: `Payback brut budgété de ${grossPaybackMonths.toFixed(1)} mois au-dessus du plafond de ${config.paybackCapMonths} mois.`,
    });
  }

  const runways = months.map((r) => r.runwayMonths).filter((v): v is number => v !== null);
  const totals: ConsolidationTotals = {
    revenue: annualRevenue,
    otherRevenueAnnual: sum(otherRevenue),
    cogsAnnual: sum(cogs),
    grossMargin: annualGrossMargin,
    effectiveGrossMarginPct,
    ebitda: sum(months.map((r) => r.ebitda)),
    endCash: months[11].cash,
    minRunway: runways.length > 0 ? Math.min(...runways) : null,
    newMrrAnnual: sum(newMrr),
    expansionMrrAnnual: sum(expansionMrr),
    churnedMrrAnnual: sum(months.map((r) => r.churnedMrr)),
    mrrEnd: months[11].mrrEnd,
    blendedCac,
    grossPaybackMonths,
  };

  return { ok: true, blocking: [], warnings, months, departments: deptRows, channelQuarters, totals };
}

function zeros(): number[] {
  return new Array<number>(12).fill(0);
}
