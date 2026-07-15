/**
 * Navette : simulation d'un round budgetaire ("montrer a quoi ressemble l'outil une
 * fois un round fini"). Module pur : aucune dependance a Supabase, au front ou au reseau.
 *
 * Genere, pour chaque departement, des valeurs de navette COHERENTES dans les grandes
 * masses, entierement derivees de la configuration societe, des enveloppes de cadrage et
 * du revenu realise N-1. Aucun chiffre propre a une societe reelle n'est code ici.
 *
 * Reconduction visee (parametrable) :
 * - Topline : le revenu cible = revenu N-1 x (1 + croissance), croissance 40 % par defaut.
 * - COGS : le taux de marge de la config fixe les COGS (marge 70 % => COGS 30 % du revenu).
 * - Couts des fonctions : chaque departement est rempli vers son enveloppe de cadrage.
 *
 * La topline est placee sur les leviers reellement presents dans le referentiel : les
 * canaux d'acquisition (nouveaux clients x ARPA), le new MRR de partenariats, l'expansion,
 * et une part de revenus non recurrents. Le revenu recurrent annuel est AFFINE par rapport
 * au flux de new MRR (le roll-forward du MRR est lineaire) : on resout donc directement le
 * flux a injecter pour atteindre la cible, sans recherche iterative.
 */

import type {
  Channel,
  CompanyConfig,
  Department,
  DriverDef,
  DriverKind,
  LineFrequency,
  QuarterValues,
} from './types';

export interface SimulateRoundParams {
  config: CompanyConfig;
  departments: Department[];
  driverDefs: DriverDef[];
  channels: Channel[];
  /** Revenu realise de l'annee N-1, base de la reconduction. A defaut : MRR d'ouverture x 12. */
  prevYearRevenue?: number | null;
  /** Cible de CAC moyen charge, pour un canal sans plafond. A defaut : ARPA x 12. */
  cacAvgTarget?: number | null;
  /** Croissance de topline visee, en fraction. Defaut 0,40 (soit +40 %). */
  toplineGrowth?: number;
}

export interface SimulatedDriverLine {
  driverDefId: string;
  q: QuarterValues;
  /** Coût mensuel moyen par ETP, pour les lignes headcount. */
  unitCost?: number;
}

export interface SimulatedCustomLine {
  kind: DriverKind;
  label: string;
  frequency: LineFrequency;
  q: QuarterValues;
  isNew: boolean;
}

export interface SimulatedDept {
  departmentId: string;
  driverLines: SimulatedDriverLine[];
  customLines: SimulatedCustomLine[];
}

export interface SimulateRoundResult {
  departments: SimulatedDept[];
  /** Revenu cible retenu (revenu N-1 reconduit avec croissance). */
  targetRevenue: number;
}

// Constantes de reconduction, documentees et volontairement conservatrices. Elles ne
// portent aucune valeur propre a une societe : ce sont des parts et des taux generiques.
const ENVELOPE_FILL = 0.95; // on remplit chaque fonction a 95 % de son enveloppe de cadrage
const CAC_FILL = 0.9; // CAC vise a 90 % du plafond du canal : dans le cadrage, sans alerte
const ONE_SHOT_SHARE = 0.15; // part de revenus non recurrents dans le revenu cible
const EXPANSION_SHARE = 0.15; // part d'expansion dans le flux de new MRR
const NEW_MRR_SHARE = 0.1; // part de new MRR de partenariats dans le flux de new MRR
const CHANNEL_SHARE = 0.75; // le reste passe par les canaux d'acquisition
const PAYROLL_SPLIT = 0.78; // part de la masse salariale dans les couts discretionnaires
const HC_UNIT_COST = 7500; // cout mensuel moyen par ETP, pour les lignes headcount
// Legere montee en charge intra-annuelle (somme = 1) : un budget qui croit au fil des trimestres.
const RAMP: QuarterValues = [0.22, 0.24, 0.26, 0.28];

const round = (v: number): number => Math.round(v);
const rampQ = (annual: number): QuarterValues => [
  round(annual * RAMP[0]),
  round(annual * RAMP[1]),
  round(annual * RAMP[2]),
  round(annual * RAMP[3]),
];

/** Revenu recurrent annuel (somme des MRR de fin de mois) pour un flux de new MRR trimestriel donne. */
function annualRecurringRevenue(openingMrr: number, churn: number, quarterlyNewMrr: QuarterValues): number {
  let mrrOpen = openingMrr;
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const add = quarterlyNewMrr[Math.floor(m / 3)] / 3;
    const mrrEnd = mrrOpen + add - mrrOpen * churn;
    total += mrrEnd;
    mrrOpen = mrrEnd;
  }
  return total;
}

export function simulateRound(p: SimulateRoundParams): SimulateRoundResult {
  const { config, departments, driverDefs, channels } = p;
  const growth = p.toplineGrowth ?? 0.4;
  const arpa = config.arpa > 0 ? config.arpa : 1;

  const baseRevenue = p.prevYearRevenue && p.prevYearRevenue > 0 ? p.prevYearRevenue : config.openingMrr * 12;
  const targetRevenue = baseRevenue * (1 + growth);

  // Accumulateurs : une ligne par driver rempli, des lignes libres par departement.
  const driverLineById = new Map<string, SimulatedDriverLine>();
  const customByDept = new Map<string, SimulatedCustomLine[]>(departments.map((d) => [d.id, []]));
  const cogsByDept = new Map<string, number>(departments.map((d) => [d.id, 0]));
  const channelSpendByDept = new Map<string, number>(departments.map((d) => [d.id, 0]));

  const setDriver = (id: string, q: QuarterValues, unitCost?: number) =>
    driverLineById.set(id, { driverDefId: id, q, unitCost });

  // 1. COGS : le taux de marge fixe le total, reparti entre les drivers COGS. -----------
  const cogsDrivers = driverDefs.filter((d) => d.kind === 'cogs');
  const totalCogs = (1 - config.grossMarginPct) * targetRevenue;
  if (cogsDrivers.length > 0) {
    const per = totalCogs / cogsDrivers.length;
    for (const d of cogsDrivers) {
      const q = rampQ(per);
      setDriver(d.id, q);
      cogsByDept.set(d.departmentId, cogsByDept.get(d.departmentId)! + (q[0] + q[1] + q[2] + q[3]));
    }
  }

  // 2. Revenus non recurrents : une part du revenu cible, si un driver revenue_other existe. -
  const otherDrivers = driverDefs.filter((d) => d.kind === 'revenue_other');
  const osAnnual = otherDrivers.length > 0 ? targetRevenue * ONE_SHOT_SHARE : 0;
  if (otherDrivers.length > 0) {
    const per = osAnnual / otherDrivers.length;
    for (const d of otherDrivers) setDriver(d.id, rampQ(per));
  }

  // 3. Flux de new MRR a injecter pour atteindre le revenu recurrent cible. --------------
  // Le revenu recurrent est affine par rapport au flux annuel A : base0 + A x pente.
  const recurringTarget = targetRevenue - osAnnual;
  const base0 = annualRecurringRevenue(config.openingMrr, config.monthlyChurnPct, [0, 0, 0, 0]);
  const unit = annualRecurringRevenue(config.openingMrr, config.monthlyChurnPct, RAMP) - base0;
  const grossNewMrr = unit > 0 ? Math.max(0, (recurringTarget - base0) / unit) : 0;

  // 4. Repartition du flux sur les leviers reellement presents (renormalisee). -----------
  const custDriversByChannel = channels
    .map((c) => ({
      channel: c,
      cust: driverDefs.find((d) => d.kind === 'channel_customers' && d.channelId === c.id),
      spend: driverDefs.find((d) => d.kind === 'channel_spend' && d.channelId === c.id),
    }))
    .filter((x) => x.cust);
  const newMrrDrivers = driverDefs.filter((d) => d.kind === 'new_mrr');
  const expansionDrivers = driverDefs.filter((d) => d.kind === 'expansion_mrr');

  let wChannel = custDriversByChannel.length > 0 ? CHANNEL_SHARE : 0;
  let wNew = newMrrDrivers.length > 0 ? NEW_MRR_SHARE : 0;
  let wExp = expansionDrivers.length > 0 ? EXPANSION_SHARE : 0;
  const wSum = wChannel + wNew + wExp;
  if (wSum > 0) {
    wChannel /= wSum;
    wNew /= wSum;
    wExp /= wSum;
  }

  // 4a. Canaux : nouveaux clients = part du flux / ARPA ; depenses = clients x CAC cible.
  const channelMrr = grossNewMrr * wChannel;
  if (custDriversByChannel.length > 0 && channelMrr > 0) {
    const customersAnnual = channelMrr / arpa;
    const perChannel = customersAnnual / custDriversByChannel.length;
    for (const { channel, cust, spend } of custDriversByChannel) {
      const targetCac = channel.cacCap != null ? channel.cacCap * CAC_FILL : p.cacAvgTarget ?? arpa * 12;
      const custQ: QuarterValues = [
        round(perChannel * RAMP[0]),
        round(perChannel * RAMP[1]),
        round(perChannel * RAMP[2]),
        round(perChannel * RAMP[3]),
      ];
      setDriver(cust!.id, custQ);
      if (spend) {
        const spendQ: QuarterValues = [
          round(custQ[0] * targetCac),
          round(custQ[1] * targetCac),
          round(custQ[2] * targetCac),
          round(custQ[3] * targetCac),
        ];
        setDriver(spend.id, spendQ);
        channelSpendByDept.set(
          spend.departmentId,
          channelSpendByDept.get(spend.departmentId)! + (spendQ[0] + spendQ[1] + spendQ[2] + spendQ[3]),
        );
      }
    }
  }

  // 4b. New MRR de partenariats et expansion : repartis sur leurs drivers.
  if (newMrrDrivers.length > 0) {
    const per = (grossNewMrr * wNew) / newMrrDrivers.length;
    for (const d of newMrrDrivers) setDriver(d.id, rampQ(per));
  }
  if (expansionDrivers.length > 0) {
    const per = (grossNewMrr * wExp) / expansionDrivers.length;
    for (const d of expansionDrivers) setDriver(d.id, rampQ(per));
  }

  // 5. Couts discretionnaires par departement : on remplit vers l'enveloppe. -------------
  for (const dept of departments) {
    const defs = driverDefs.filter((d) => d.departmentId === dept.id);
    const cogsHere = cogsByDept.get(dept.id)!;
    const channelHere = channelSpendByDept.get(dept.id)!;
    const costTotalTarget = dept.envelope != null ? dept.envelope * ENVELOPE_FILL : cogsHere + channelHere;
    const discretionary = Math.max(0, costTotalTarget - cogsHere - channelHere);
    if (discretionary <= 0) continue;

    const payrollTarget = discretionary * PAYROLL_SPLIT;
    const opexTarget = discretionary - payrollTarget;

    // Masse salariale : sur un driver headcount, sinon un driver payroll, sinon une ligne libre.
    const hcDriver = defs.find((d) => d.kind === 'headcount');
    const payrollDriver = defs.find((d) => d.kind === 'payroll');
    if (hcDriver) {
      // annuel = unitCost x 3 x somme des niveaux trimestriels => somme des niveaux = cible / (3 x unitCost).
      const levelsSum = payrollTarget / (3 * HC_UNIT_COST);
      setDriver(
        hcDriver.id,
        [
          round(levelsSum * RAMP[0] * 10) / 10,
          round(levelsSum * RAMP[1] * 10) / 10,
          round(levelsSum * RAMP[2] * 10) / 10,
          round(levelsSum * RAMP[3] * 10) / 10,
        ],
        HC_UNIT_COST,
      );
    } else if (payrollDriver) {
      setDriver(payrollDriver.id, rampQ(payrollTarget));
    } else {
      customByDept.get(dept.id)!.push({
        kind: 'payroll',
        label: 'Masse salariale (simulation)',
        frequency: 'mensuel',
        q: rampQ(payrollTarget),
        isNew: false,
      });
    }

    // Opex : sur un driver opex, sinon une ligne libre.
    if (opexTarget > 0) {
      const opexDriver = defs.find((d) => d.kind === 'opex');
      if (opexDriver) {
        setDriver(opexDriver.id, rampQ(opexTarget));
      } else {
        customByDept.get(dept.id)!.push({
          kind: 'opex',
          label: 'Frais et outils (simulation)',
          frequency: 'trimestriel',
          q: rampQ(opexTarget),
          isNew: false,
        });
      }
    }
  }

  // 6. Regroupement par departement.
  const result: SimulatedDept[] = departments.map((dept) => ({
    departmentId: dept.id,
    driverLines: driverDefs
      .filter((d) => d.departmentId === dept.id && driverLineById.has(d.id))
      .map((d) => driverLineById.get(d.id)!),
    customLines: customByDept.get(dept.id)!,
  }));

  return { departments: result, targetRevenue };
}
