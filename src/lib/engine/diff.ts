import { consolidate } from './consolidate';
import { sum } from './monthlyize';
import { isInlineLine } from './types';
import type {
  CompanyConfig,
  ConsolidationInputs,
  DriverDef,
  DriverKind,
  DriverSubmissionLine,
  InlineSubmissionLine,
  LineDiff,
  QuarterValues,
  Submission,
  SubmissionDiff,
} from './types';

/**
 * Impact annuel d'une ligne, en euros :
 * - headcount : coût annuel (ETP du trimestre x 3 mois x coût mensuel moyen) ;
 * - payroll, opex, cogs, capex et channel_spend : somme des quatre trimestres (coût) ;
 * - new_mrr, expansion_mrr et revenue_other : revenu annuel ajouté (somme des flux) ;
 * - channel_customers : nouveaux clients x ARPA (MRR annuel ajouté).
 */
function annualImpact(kind: DriverKind, q: QuarterValues | null, unitCost: number | undefined, config: CompanyConfig): number {
  if (!q) return 0;
  switch (kind) {
    case 'headcount':
      return sum(q) * 3 * (unitCost ?? 0);
    case 'payroll':
    case 'opex':
    case 'cogs':
    case 'capex':
    case 'channel_spend':
    case 'new_mrr':
    case 'expansion_mrr':
    case 'revenue_other':
      return sum(q);
    case 'channel_customers':
      return sum(q) * config.arpa;
    case 'churn_rate':
      // Objectif de churn : pas d'impact monetaire par ligne (l'impact passe par le MRR consolide).
      return 0;
  }
}

const sameQ = (a: QuarterValues, b: QuarterValues) => a.every((v, i) => v === b[i]);

/**
 * Compare deux versions de navette d'un même département : lignes du référentiel
 * (appariées par driver) et lignes libres (appariées par libellé).
 * Si `inputs` est fourni (le contexte complet de consolidation, avec la version "before"
 * en place pour le département concerné), calcule aussi l'impact consolidé du passage
 * à la version "after" : delta d'EBITDA annuel, delta de trésorerie de fin d'année,
 * runway minimum avant et après.
 */
export function diffSubmissions(
  driverDefs: DriverDef[],
  config: CompanyConfig,
  before: Submission,
  after: Submission,
  inputs?: ConsolidationInputs,
): SubmissionDiff {
  if (before.departmentId !== after.departmentId) {
    throw new Error('diffSubmissions : les deux navettes doivent appartenir au même département.');
  }
  const defById = new Map(driverDefs.map((d) => [d.id, d]));

  const split = (sub: Submission) => {
    const drivers = new Map<string, DriverSubmissionLine>();
    const customs = new Map<string, InlineSubmissionLine>();
    for (const l of sub.lines) {
      if (isInlineLine(l)) customs.set(l.label, l);
      else drivers.set(l.driverDefId, l);
    }
    return { drivers, customs };
  };
  const b = split(before);
  const a = split(after);

  const lines: LineDiff[] = [];

  // 1. Lignes du référentiel, appariées par driver.
  for (const defId of new Set([...b.drivers.keys(), ...a.drivers.keys()])) {
    const def = defById.get(defId);
    if (!def) continue; // driver inconnu : relève des contrôles bloquants, pas du diff
    const lineBefore = b.drivers.get(defId) ?? null;
    const lineAfter = a.drivers.get(defId) ?? null;
    const unchanged =
      lineBefore !== null &&
      lineAfter !== null &&
      sameQ(lineBefore.q, lineAfter.q) &&
      (lineBefore.unitCost ?? null) === (lineAfter.unitCost ?? null);
    if (unchanged) continue;
    lines.push({
      key: defId,
      driverDefId: defId,
      isCustom: false,
      label: def.label,
      kind: def.kind,
      before: lineBefore ? lineBefore.q : null,
      after: lineAfter ? lineAfter.q : null,
      unitCostBefore: lineBefore?.unitCost,
      unitCostAfter: lineAfter?.unitCost,
      deltaAnnual:
        annualImpact(def.kind, lineAfter ? lineAfter.q : null, lineAfter?.unitCost, config) -
        annualImpact(def.kind, lineBefore ? lineBefore.q : null, lineBefore?.unitCost, config),
    });
  }

  // 2. Lignes libres, appariées par libellé.
  for (const label of new Set([...b.customs.keys(), ...a.customs.keys()])) {
    const lineBefore = b.customs.get(label) ?? null;
    const lineAfter = a.customs.get(label) ?? null;
    const unchanged =
      lineBefore !== null &&
      lineAfter !== null &&
      sameQ(lineBefore.q, lineAfter.q) &&
      lineBefore.frequency === lineAfter.frequency &&
      lineBefore.kind === lineAfter.kind;
    if (unchanged) continue;
    const kind = (lineAfter ?? lineBefore)!.kind;
    lines.push({
      key: `custom:${label}`,
      isCustom: true,
      label,
      kind,
      before: lineBefore ? lineBefore.q : null,
      after: lineAfter ? lineAfter.q : null,
      deltaAnnual:
        annualImpact(kind, lineAfter ? lineAfter.q : null, undefined, config) -
        annualImpact(kind, lineBefore ? lineBefore.q : null, undefined, config),
    });
  }

  let impact: SubmissionDiff['impact'] = null;
  if (inputs) {
    const withVersion = (sub: Submission): ConsolidationInputs => ({
      ...inputs,
      submissions: inputs.submissions.map((s) => (s.departmentId === before.departmentId ? sub : s)),
    });
    const resBefore = consolidate(withVersion({ ...before, status: 'submitted' }));
    const resAfter = consolidate(withVersion({ ...after, status: 'submitted' }));
    if (resBefore.ok && resAfter.ok) {
      impact = {
        deltaEbitda: resAfter.totals!.ebitda - resBefore.totals!.ebitda,
        deltaEndCash: resAfter.totals!.endCash - resBefore.totals!.endCash,
        minRunwayBefore: resBefore.totals!.minRunway,
        minRunwayAfter: resAfter.totals!.minRunway,
      };
    }
  }

  return {
    departmentId: before.departmentId,
    versionBefore: before.version,
    versionAfter: after.version,
    lines,
    impact,
  };
}
