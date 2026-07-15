/**
 * Navette : remplissage des navettes selon un scenario pluriannuel (memoire Section 2).
 * Module pur : aucune dependance a Supabase, au front ou au reseau.
 *
 * A partir des hypotheses de simulation et du moteur scenario.ts, calcule les cibles N+1
 * du scenario choisi (as is / rebound) puis les traduit en valeurs de drivers de navettes
 * telles que la CONSOLIDATION retombe sur le P&L du scenario. Meme forme de sortie que
 * simulateRound (SimulatedDept), pour reutiliser le meme code d'insertion.
 *
 * Construction (tout en euros) :
 * - Revenu : les canaux d'acquisition portent `cacEffort.gross` nouveaux clients bruts sur
 *   l'annee ; le MRR recurrent qui en decoule (roll-forward, churn de la config) est complete
 *   par des revenus non recurrents pour atteindre exactement la cible de CA.
 * - S&M : la totalite de la cible S&M passe par les depenses des canaux (mises a l'echelle
 *   pour sommer exactement la cible), de sorte que le CAC moyen consolide = S&M / clients.
 *   La forme trimestrielle suit la trajectoire de CAC des hypotheses.
 * - COGS : la cible de couts variables, repartie sur les drivers COGS au prorata de
 *   l'enveloppe de leur departement.
 * - Structure : la cible de structure, repartie sur les departements hors S&M au prorata de
 *   leur marge d'enveloppe restante (enveloppe moins COGS deja loge), en masse salariale et opex.
 *
 * Aucune valeur propre a une societe n'est codee ici : tout vient de la config, des
 * enveloppes de cadrage et des hypotheses de simulation.
 */

import { monthlyizeFlow, sum } from './monthlyize';
import { projectScenarios, type ScenarioAssumptions, type ScenarioHistoryYearN } from './scenario';
import type { Channel, CompanyConfig, Department, DriverDef, QuarterValues } from './types';
import type { SimulatedCustomLine, SimulatedDept, SimulatedDriverLine } from './simulate-round';

export interface FillScenarioParams {
  mode: 'asIs' | 'rebound';
  config: CompanyConfig;
  departments: Department[];
  driverDefs: DriverDef[];
  channels: Channel[];
  /** Dernier exercice realise N (K€). */
  history: ScenarioHistoryYearN;
  /** Hypotheses de simulation (K€, ARPA en €). */
  assumptions: ScenarioAssumptions;
  /** Trajectoire trimestrielle de CAC (€), 4 valeurs. Donne la forme des depenses canaux. */
  cacTrajectory: number[];
}

export interface FillScenarioTargets {
  revenue: number;
  cogs: number;
  sm: number;
  structure: number;
  ebitda: number;
  grossCustomers: number;
  blendedCac: number;
}

export interface FillScenarioResult {
  departments: SimulatedDept[];
  targets: FillScenarioTargets;
}

// Montee en charge intra-annuelle (somme = 1) et forme des couts. Generiques, sans valeur societe.
const RAMP: QuarterValues = [0.22, 0.24, 0.26, 0.28];
const PAYROLL_SPLIT = 0.75; // part de la masse salariale dans les couts de structure discretionnaires

const round = (v: number): number => Math.round(v);
const rampQ = (annual: number): QuarterValues => {
  const a = round(annual * RAMP[0]);
  const b = round(annual * RAMP[1]);
  const c = round(annual * RAMP[2]);
  const d = round(annual) - a - b - c; // le dernier trimestre absorbe l'arrondi : somme exacte
  return [a, b, c, d];
};

/** Revenu recurrent annuel (somme des MRR de fin de mois) pour un profil mensuel de new MRR. */
function annualRecurring(openingMrr: number, churn: number, monthlyNewMrr: number[]): number {
  let mrr = openingMrr;
  let total = 0;
  for (let m = 0; m < 12; m++) {
    mrr = mrr + monthlyNewMrr[m] - mrr * churn;
    total += mrr;
  }
  return total;
}

export function fillScenario(p: FillScenarioParams): FillScenarioResult {
  const { config, departments, driverDefs, channels } = p;
  const arpa = config.arpa > 0 ? config.arpa : 1;
  const scenarios = projectScenarios(p.history, p.assumptions);
  const scen = p.mode === 'asIs' ? scenarios.asIs : scenarios.rebound;
  const y1 = scen.years[0];

  // Cibles N+1 en euros (le moteur scenario travaille en K€).
  const revenueTarget = y1.ca * 1000;
  const cogsTarget = y1.variableCosts * 1000;
  const smTarget = y1.sm * 1000;
  const structureTarget = y1.structure * 1000;
  const grossCustomers = round(scenarios.cacEffort.gross);

  const envOf = (deptId: string) => {
    const d = departments.find((x) => x.id === deptId);
    return d && d.envelope != null ? d.envelope : 0;
  };

  const driverLineById = new Map<string, SimulatedDriverLine>();
  const customByDept = new Map<string, SimulatedCustomLine[]>(departments.map((d) => [d.id, []]));
  const cogsByDept = new Map<string, number>(departments.map((d) => [d.id, 0]));
  const setDriver = (id: string, q: QuarterValues, unitCost?: number) =>
    driverLineById.set(id, { driverDefId: id, q, unitCost });

  // 1. Clients par canal et par trimestre : `grossCustomers` reparti egalement entre canaux,
  //    en montee en charge sur l'annee. -------------------------------------------------------
  const custDrivers = channels
    .map((c) => ({
      channel: c,
      cust: driverDefs.find((d) => d.kind === 'channel_customers' && d.channelId === c.id),
      spend: driverDefs.find((d) => d.kind === 'channel_spend' && d.channelId === c.id),
    }))
    .filter((x) => x.cust && x.spend);

  const monthlyNewMrr = new Array<number>(12).fill(0);
  const custQByChannel: { id: string; spendId: string; deptId: string; q: QuarterValues }[] = [];
  if (custDrivers.length > 0) {
    const perChannel = grossCustomers / custDrivers.length;
    for (const { cust, spend } of custDrivers) {
      const q = rampQ(perChannel);
      setDriver(cust!.id, q);
      custQByChannel.push({ id: cust!.id, spendId: spend!.id, deptId: cust!.departmentId, q });
      const flow = monthlyizeFlow(q);
      for (let m = 0; m < 12; m++) monthlyNewMrr[m] += flow[m] * arpa;
    }
  }

  // 2. Depenses des canaux : forme = trajectoire de CAC x clients, mises a l'echelle pour que
  //    la somme egale EXACTEMENT la cible S&M (donc CAC moyen consolide = S&M / clients). -----
  const traj = p.cacTrajectory && p.cacTrajectory.length === 4 ? p.cacTrajectory : [arpa * 12, arpa * 12, arpa * 12, arpa * 12];
  let rawTotal = 0;
  const rawSpend = custQByChannel.map((c) => {
    const s: QuarterValues = [traj[0] * c.q[0], traj[1] * c.q[1], traj[2] * c.q[2], traj[3] * c.q[3]];
    rawTotal += s[0] + s[1] + s[2] + s[3];
    return s;
  });
  const scale = rawTotal > 0 ? smTarget / rawTotal : 0;
  let placedSpend = 0;
  rawSpend.forEach((s, i) => {
    const q: QuarterValues = [round(s[0] * scale), round(s[1] * scale), round(s[2] * scale), round(s[3] * scale)];
    placedSpend += q[0] + q[1] + q[2] + q[3];
    setDriver(custQByChannel[i].spendId, q);
  });
  // Corrige l'arrondi cumule sur le dernier canal, pour que le S&M consolide soit exact.
  if (rawSpend.length > 0) {
    const last = driverLineById.get(custQByChannel[custQByChannel.length - 1].spendId)!;
    last.q[3] += smTarget - placedSpend;
  }

  // 3. COGS : cible repartie sur les drivers COGS au prorata de l'enveloppe de leur departement. -
  const cogsDrivers = driverDefs.filter((d) => d.kind === 'cogs');
  if (cogsDrivers.length > 0) {
    const weights = cogsDrivers.map((d) => Math.max(1, envOf(d.departmentId)));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let placed = 0;
    cogsDrivers.forEach((d, i) => {
      const share = i === cogsDrivers.length - 1 ? cogsTarget - placed : round((cogsTarget * weights[i]) / wSum);
      placed += share;
      setDriver(d.id, rampQ(share));
      cogsByDept.set(d.departmentId, cogsByDept.get(d.departmentId)! + share);
    });
  }

  // 4. Structure : cible repartie sur les departements hors S&M au prorata de leur marge
  //    d'enveloppe restante (enveloppe - COGS deja loge), en masse salariale (ligne libre)
  //    et opex (driver si present, sinon ligne libre). ----------------------------------------
  const structureDepts = departments.filter((d) => !d.isSalesMarketing);
  const headroom = structureDepts.map((d) => Math.max(1, envOf(d.id) - cogsByDept.get(d.id)!));
  const hSum = headroom.reduce((a, b) => a + b, 0);
  let placedStruct = 0;
  structureDepts.forEach((dept, i) => {
    const share = i === structureDepts.length - 1 ? structureTarget - placedStruct : round((structureTarget * headroom[i]) / hSum);
    placedStruct += share;
    const payroll = round(share * PAYROLL_SPLIT);
    const opex = share - payroll;
    customByDept.get(dept.id)!.push({
      kind: 'payroll',
      label: 'Masse salariale (scénario)',
      frequency: 'mensuel',
      q: rampQ(payroll),
      isNew: false,
    });
    if (opex > 0) {
      const opexDriver = driverDefs.find((d) => d.kind === 'opex' && d.departmentId === dept.id);
      if (opexDriver) setDriver(opexDriver.id, rampQ(opex));
      else customByDept.get(dept.id)!.push({ kind: 'opex', label: 'Frais et outils (scénario)', frequency: 'trimestriel', q: rampQ(opex), isNew: false });
    }
  });

  // 5. Objectif de churn : on cale la ligne churn_rate sur le taux de la config (le roll-forward
  //    reste sur ce taux), pour que le revenu recurrent calcule ici soit celui de la conso. ----
  const churnDriver = driverDefs.find((d) => d.kind === 'churn_rate');
  const churnPct = config.monthlyChurnPct;
  if (churnDriver) {
    const c = round(churnPct * 100 * 100) / 100; // 0,013 -> 1,3
    setDriver(churnDriver.id, [c, c, c, c]);
  }

  // 6. Revenus non recurrents : complement pour atteindre exactement la cible de CA. ----------
  const recurring = annualRecurring(config.openingMrr, churnPct, monthlyNewMrr);
  const otherRevenue = Math.max(0, round(revenueTarget - recurring));
  const otherDriver = driverDefs.find((d) => d.kind === 'revenue_other');
  if (otherDriver) {
    const per = round(otherRevenue / 4);
    setDriver(otherDriver.id, [per, per, per, otherRevenue - 3 * per]);
  } else {
    const target = departments.find((d) => d.isSalesMarketing) ?? departments[0];
    if (target) {
      const per = round(otherRevenue / 4);
      customByDept.get(target.id)!.push({ kind: 'revenue_other', label: 'Revenus non récurrents (scénario)', frequency: 'trimestriel', q: [per, per, per, otherRevenue - 3 * per], isNew: false });
    }
  }

  // 7. Regroupement par departement. -------------------------------------------------------
  const result: SimulatedDept[] = departments.map((dept) => ({
    departmentId: dept.id,
    driverLines: driverDefs
      .filter((d) => d.departmentId === dept.id && driverLineById.has(d.id))
      .map((d) => driverLineById.get(d.id)!),
    customLines: customByDept.get(dept.id)!,
  }));

  return {
    departments: result,
    targets: {
      revenue: revenueTarget,
      cogs: cogsTarget,
      sm: smTarget,
      structure: structureTarget,
      ebitda: y1.ebitda * 1000,
      grossCustomers,
      blendedCac: grossCustomers > 0 ? smTarget / grossCustomers : 0,
    },
  };
}
