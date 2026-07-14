import type { Alert, ConsolidationInputs, DriverDef } from './types';

/**
 * Contrôles bloquants : intégrité des données uniquement.
 * Si l'un d'eux échoue, le moteur refuse de consolider : on ne produit pas un P&L faux.
 * Les règles de gestion (enveloppes, plafonds CAC, seuils de runway) ne sont jamais
 * bloquantes : elles produisent des alertes destinées à l'arbitrage (voir consolidate.ts).
 */
export function validateInputs(inputs: ConsolidationInputs): Alert[] {
  const blocking: Alert[] = [];
  const { config, departments, driverDefs, channels, submissions } = inputs;

  // 1. Configuration société
  if (!(config.arpa > 0)) {
    blocking.push(b('CONFIG_ARPA', `ARPA invalide (${config.arpa}) : doit être strictement positif.`));
  }
  if (!(config.grossMarginPct > 0 && config.grossMarginPct <= 1)) {
    blocking.push(b('CONFIG_MARGE', `Marge brute invalide (${config.grossMarginPct}) : attendue entre 0 et 1.`));
  }
  if (!(config.monthlyChurnPct >= 0 && config.monthlyChurnPct < 1)) {
    blocking.push(b('CONFIG_CHURN', `Churn mensuel invalide (${config.monthlyChurnPct}) : attendu entre 0 et 1 exclu.`));
  }
  if (!Number.isFinite(config.openingMrr) || config.openingMrr < 0) {
    blocking.push(b('CONFIG_MRR', `MRR d'ouverture invalide (${config.openingMrr}).`));
  }
  if (!Number.isFinite(config.openingCash)) {
    blocking.push(b('CONFIG_CASH', `Trésorerie d'ouverture invalide (${config.openingCash}).`));
  }

  const deptById = new Map(departments.map((d) => [d.id, d]));
  const defById = new Map(driverDefs.map((d) => [d.id, d]));
  const channelIds = new Set(channels.map((c) => c.id));

  // 2. Cohérence du référentiel
  for (const def of driverDefs) {
    if (!deptById.has(def.departmentId)) {
      blocking.push(b('DEF_DEPT_INCONNU', `Le driver "${def.label}" référence un département inconnu.`));
    }
    if ((def.kind === 'channel_spend' || def.kind === 'channel_customers') && (!def.channelId || !channelIds.has(def.channelId))) {
      blocking.push(b('DEF_CANAL_INCONNU', `Le driver "${def.label}" (${def.kind}) référence un canal inconnu ou absent.`));
    }
  }

  // 3. Une soumission "submitted" par département, sans doublon
  const seen = new Set<string>();
  for (const sub of submissions) {
    const dept = deptById.get(sub.departmentId);
    const deptName = dept ? dept.name : sub.departmentId;
    if (!dept) {
      blocking.push(b('NAVETTE_DEPT_INCONNU', `Une navette référence un département inconnu (${sub.departmentId}).`));
      continue;
    }
    if (seen.has(sub.departmentId)) {
      blocking.push(b('NAVETTE_DOUBLON', `Deux navettes fournies pour le département ${deptName} : une seule attendue.`, sub.departmentId));
    }
    seen.add(sub.departmentId);
    if (sub.status !== 'submitted') {
      blocking.push(b('NAVETTE_NON_SOUMISE', `La navette du département ${deptName} (v${sub.version}) est encore en brouillon.`, sub.departmentId));
    }
  }
  for (const dept of departments) {
    if (!seen.has(dept.id)) {
      blocking.push(b('NAVETTE_MANQUANTE', `Aucune navette soumise pour le département ${dept.name}.`, dept.id));
    }
  }

  // 4. Contenu des lignes
  for (const sub of submissions) {
    const dept = deptById.get(sub.departmentId);
    const deptName = dept ? dept.name : sub.departmentId;
    for (const line of sub.lines) {
      const def = defById.get(line.driverDefId);
      if (!def) {
        blocking.push(b('LIGNE_DRIVER_INCONNU', `Navette ${deptName} : une ligne référence un driver inconnu (${line.driverDefId}).`, sub.departmentId));
        continue;
      }
      if (def.departmentId !== sub.departmentId) {
        blocking.push(b('LIGNE_MAUVAIS_DEPT', `Navette ${deptName} : la ligne "${def.label}" appartient à un autre département.`, sub.departmentId));
      }
      if (!Array.isArray(line.q) || line.q.length !== 4) {
        blocking.push(b('LIGNE_TRIMESTRES', `Navette ${deptName}, ligne "${def.label}" : quatre valeurs trimestrielles attendues.`, sub.departmentId));
        continue;
      }
      line.q.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          blocking.push(bq('LIGNE_NON_NUMERIQUE', `Navette ${deptName}, ligne "${def.label}", T${i + 1} : valeur non numérique.`, sub.departmentId, i + 1));
        } else if (v < 0) {
          blocking.push(bq('LIGNE_NEGATIVE', `Navette ${deptName}, ligne "${def.label}", T${i + 1} : valeur négative (${v}) non admise.`, sub.departmentId, i + 1));
        }
      });
      if (def.kind === 'headcount') {
        if (line.unitCost === undefined || !Number.isFinite(line.unitCost) || line.unitCost < 0) {
          blocking.push(b('LIGNE_COUT_UNITAIRE', `Navette ${deptName}, ligne "${def.label}" : coût mensuel moyen par ETP manquant ou invalide.`, sub.departmentId));
        }
      }
    }
  }

  return blocking;
}

function b(code: string, message: string, departmentId?: string): Alert {
  return { severity: 'bloquant', code, message, departmentId };
}

function bq(code: string, message: string, departmentId: string, quarter: number): Alert {
  return { severity: 'bloquant', code, message, departmentId, quarter };
}

export function defsByDept(driverDefs: DriverDef[]): Map<string, DriverDef[]> {
  const map = new Map<string, DriverDef[]>();
  for (const def of driverDefs) {
    const list = map.get(def.departmentId) ?? [];
    list.push(def);
    map.set(def.departmentId, list);
  }
  return map;
}
