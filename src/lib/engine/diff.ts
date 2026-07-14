import { consolidate } from './consolidate';
import { sum } from './monthlyize';
import type {
  CompanyConfig,
  ConsolidationInputs,
  DriverDef,
  LineDiff,
  Submission,
  SubmissionDiff,
  SubmissionLine,
} from './types';

/**
 * Impact annuel d'une ligne, en euros :
 * - headcount : coût annuel (ETP du trimestre x 3 mois x coût mensuel moyen) ;
 * - payroll, opex, cogs et channel_spend : somme des quatre trimestres (coût) ;
 * - new_mrr, expansion_mrr et revenue_other : revenu annuel ajouté (somme des flux) ;
 * - channel_customers : nouveaux clients x ARPA (MRR annuel ajouté).
 */
function annualImpact(def: DriverDef, line: SubmissionLine | null, config: CompanyConfig): number {
  if (!line) return 0;
  switch (def.kind) {
    case 'headcount':
      return sum(line.q) * 3 * (line.unitCost ?? 0);
    case 'payroll':
    case 'opex':
    case 'cogs':
    case 'capex':
    case 'channel_spend':
      return sum(line.q);
    case 'new_mrr':
    case 'expansion_mrr':
    case 'revenue_other':
      return sum(line.q);
    case 'channel_customers':
      return sum(line.q) * config.arpa;
  }
}

/**
 * Compare deux versions de navette d'un même département.
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
  const beforeByDef = new Map(before.lines.map((l) => [l.driverDefId, l]));
  const afterByDef = new Map(after.lines.map((l) => [l.driverDefId, l]));
  const allDefIds = [...new Set([...beforeByDef.keys(), ...afterByDef.keys()])];

  const lines: LineDiff[] = [];
  for (const defId of allDefIds) {
    const def = defById.get(defId);
    if (!def) continue; // driver inconnu : relève des contrôles bloquants, pas du diff
    const lineBefore = beforeByDef.get(defId) ?? null;
    const lineAfter = afterByDef.get(defId) ?? null;
    const unchanged =
      lineBefore !== null &&
      lineAfter !== null &&
      lineBefore.q.every((v, i) => v === lineAfter.q[i]) &&
      (lineBefore.unitCost ?? null) === (lineAfter.unitCost ?? null);
    if (unchanged) continue;
    lines.push({
      driverDefId: defId,
      label: def.label,
      kind: def.kind,
      before: lineBefore ? lineBefore.q : null,
      after: lineAfter ? lineAfter.q : null,
      unitCostBefore: lineBefore?.unitCost,
      unitCostAfter: lineAfter?.unitCost,
      deltaAnnual: annualImpact(def, lineAfter, config) - annualImpact(def, lineBefore, config),
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
