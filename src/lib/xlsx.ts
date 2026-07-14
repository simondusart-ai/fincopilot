import { BUSINESS_CASE_TAG, isInlineLine } from './engine';
import type { ConsolidationInputs, ConsolidationResult } from './engine';
import { MONTH_LABELS } from './format';

/**
 * Exporte le résultat de consolidation en classeur Excel (téléchargement navigateur).
 * Le classeur reste le livrable comité de direction : P&L mensuel, départements,
 * canaux d'acquisition, alertes.
 */
export async function exportConsolidation(
  result: ConsolidationResult,
  companyName: string,
  budgetYear: number,
  inputs?: ConsolidationInputs,
): Promise<void> {
  if (!result.ok || !result.totals) {
    throw new Error('Consolidation bloquée : rien à exporter.');
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Navette';

  const eur = '#,##0';
  const pct = '0.0%';
  const bold = { bold: true } as const;

  // Onglet 1 : P&L mensuel
  const pl = wb.addWorksheet('P&L mensuel');
  pl.addRow([`${companyName} : budget ${budgetYear}, P&L mensuel consolidé (euros)`]).font = bold;
  pl.addRow([]);
  const header = ['Ligne', ...MONTH_LABELS, 'Année'];
  pl.addRow(header).font = bold;
  const rows: Array<[string, (m: number) => number, string?]> = [
    ['MRR fin de mois', (m) => result.months[m].mrrEnd],
    ['dont nouveau MRR', (m) => result.months[m].newMrr],
    ['dont expansion', (m) => result.months[m].expansionMrr],
    ['dont churn', (m) => -result.months[m].churnedMrr],
    ['Revenus non récurrents', (m) => result.months[m].otherRevenue],
    ['Revenu', (m) => result.months[m].revenue],
    ['COGS', (m) => -result.months[m].cogsTotal],
    ['Marge brute', (m) => result.months[m].grossMargin],
    ['Coûts S&M', (m) => -result.months[m].smSpend],
    ['Marge de contribution', (m) => result.months[m].contributionMargin],
    ['Salaires', (m) => -result.months[m].payrollTotal],
    ['Autres opex', (m) => -result.months[m].opexTotal],
    ['EBITDA', (m) => result.months[m].ebitda],
    ['Capex', (m) => -result.months[m].capexTotal],
    ['Trésorerie fin de mois', (m) => result.months[m].cash],
  ];
  for (const [label, fn] of rows) {
    const values = Array.from({ length: 12 }, (_, m) => fn(m));
    const isStock = label.startsWith('MRR') || label.startsWith('Trésorerie');
    const annual = isStock ? values[11] : values.reduce((a, b) => a + b, 0);
    const r = pl.addRow([label, ...values, annual]);
    r.eachCell((cell, col) => {
      if (col > 1) cell.numFmt = eur;
    });
    if (label === 'EBITDA' || label === 'Marge de contribution') r.font = bold;
  }
  const runwayRow = pl.addRow([
    'Runway (mois)',
    ...result.months.map((r) => (r.runwayMonths === null ? 'n.a.' : Number(r.runwayMonths.toFixed(1)))),
    result.totals.minRunway === null ? 'n.a.' : Number(result.totals.minRunway.toFixed(1)),
  ]);
  runwayRow.getCell(1).font = bold;
  pl.getColumn(1).width = 26;
  for (let c = 2; c <= 14; c++) pl.getColumn(c).width = 11;

  // Onglet 2 : départements
  const dep = wb.addWorksheet('Départements');
  dep.addRow(['Département', 'Coût annuel (€)', 'Enveloppe de cadrage (€)', 'Dépassement (€)', 'MRR annuel ajouté (€)']).font = bold;
  for (const d of result.departments) {
    const r = dep.addRow([d.name, d.annualCost, d.envelope, d.envelopeOverrun, d.annualMrrAdded]);
    r.eachCell((cell, col) => {
      if (col > 1) cell.numFmt = eur;
    });
  }
  dep.getColumn(1).width = 28;
  for (let c = 2; c <= 5; c++) dep.getColumn(c).width = 22;

  // Onglet 3 : canaux d'acquisition
  const ch = wb.addWorksheet('Canaux');
  ch.addRow(['Canal', 'Trimestre', 'Dépenses (€)', 'Nouveaux clients', 'CAC (€)', 'Plafond CAC (€)']).font = bold;
  for (const row of result.channelQuarters) {
    ch.addRow([row.name, `T${row.quarter}`, row.spend, row.newCustomers, row.cac, row.cacCap]);
  }
  ch.getColumn(1).width = 20;
  for (let c = 3; c <= 6; c++) ch.getColumn(c).width = 16;

  // Onglet : postes de navette (référentiel, lignes libres et business cases)
  if (inputs) {
    const po = wb.addWorksheet('Postes');
    po.addRow(['Département', 'Poste', 'Type', 'Origine', 'Fréquence', 'T1 (€)', 'T2 (€)', 'T3 (€)', 'T4 (€)']).font = bold;
    const defById = new Map(inputs.driverDefs.map((d) => [d.id, d]));
    const deptById = new Map(inputs.departments.map((d) => [d.id, d]));
    for (const sub of inputs.submissions) {
      const deptName = deptById.get(sub.departmentId)?.name ?? sub.departmentId;
      for (const line of sub.lines) {
        let label: string;
        let kind: string;
        let origin: string;
        let frequency = '';
        if (isInlineLine(line)) {
          label = line.label;
          kind = line.kind;
          frequency = line.frequency;
          origin = line.label.startsWith(BUSINESS_CASE_TAG) ? 'Business case' : 'Ligne libre';
        } else {
          const def = defById.get(line.driverDefId);
          label = def?.label ?? line.driverDefId;
          kind = def?.kind ?? '';
          origin = 'Référentiel';
        }
        const r = po.addRow([deptName, label, kind, origin, frequency, line.q[0], line.q[1], line.q[2], line.q[3]]);
        r.eachCell((cell, col) => {
          if (col >= 6) cell.numFmt = eur;
        });
      }
    }
    po.getColumn(1).width = 20;
    po.getColumn(2).width = 42;
    po.getColumn(3).width = 18;
    po.getColumn(4).width = 16;
    po.getColumn(5).width = 14;
    for (let c = 6; c <= 9; c++) po.getColumn(c).width = 14;
  }

  // Onglet 4 : alertes
  const al = wb.addWorksheet('Alertes');
  al.addRow(['Code', 'Message']).font = bold;
  for (const w of result.warnings) al.addRow([w.code, w.message]);
  al.getColumn(1).width = 24;
  al.getColumn(2).width = 120;

  // Onglet 5 : hypothèses (rappel de la marge de contribution en %)
  const hy = wb.addWorksheet('Synthèse');
  hy.addRow(['Indicateur', 'Valeur']).font = bold;
  hy.addRow(['Revenu annuel (€)', result.totals.revenue]).getCell(2).numFmt = eur;
  hy.addRow(['EBITDA annuel (€)', result.totals.ebitda]).getCell(2).numFmt = eur;
  hy.addRow(['Trésorerie fin d’année (€)', result.totals.endCash]).getCell(2).numFmt = eur;
  hy.addRow(['MRR fin d’année (€)', result.totals.mrrEnd]).getCell(2).numFmt = eur;
  hy.addRow(['Runway minimum (mois)', result.totals.minRunway ?? 'n.a.']);
  hy.addRow(['CAC moyen (€)', result.totals.blendedCac ?? 'n.a.']);
  hy.addRow(['Payback brut (mois)', result.totals.grossPaybackMonths === null ? 'n.a.' : Number(result.totals.grossPaybackMonths.toFixed(1))]);
  const cmDec = result.months[11].contributionMarginPct;
  const cmCell = hy.addRow(['Marge de contribution, décembre (% du revenu)', cmDec ?? 'n.a.']).getCell(2);
  if (cmDec !== null) cmCell.numFmt = pct;
  hy.getColumn(1).width = 44;
  hy.getColumn(2).width = 18;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget_${budgetYear}_${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
