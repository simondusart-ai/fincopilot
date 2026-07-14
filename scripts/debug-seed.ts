/** Debug : imprime la consolidation des deux sociétés de seed (usage : npx tsx scripts/debug-seed.ts). */
import { consolidate } from '../src/lib/engine';
import { FINCOPILOT, HEXAFLOOR, seedToEngineInputs } from '../src/lib/seed-data';

for (const seed of [FINCOPILOT, HEXAFLOOR]) {
  const res = consolidate(seedToEngineInputs(seed));
  console.log('='.repeat(70));
  console.log(seed.config.name, '| ok =', res.ok);
  if (!res.ok) {
    res.blocking.forEach((b) => console.log('BLOQUANT', b.code, b.message));
    continue;
  }
  const t = res.totals!;
  console.log(
    `CA ${(t.revenue / 1e6).toFixed(2)} M (dont one-shot ${(t.otherRevenueAnnual / 1e6).toFixed(2)}) | ` +
    `MB eff ${(t.effectiveGrossMarginPct! * 100).toFixed(1)} % | EBITDA ${(t.ebitda / 1e3).toFixed(0)} k | ` +
    `cash fin ${(t.endCash / 1e3).toFixed(0)} k | MRR fin ${(t.mrrEnd / 1e3).toFixed(0)} k | ` +
    `CAC ${t.blendedCac?.toFixed(0)} | payback ${t.grossPaybackMonths?.toFixed(1)} | minRunway ${t.minRunway?.toFixed(1) ?? 'n.a.'}`,
  );
  console.log('mois: ebitda / cash / runway / nrr');
  res.months.forEach((m) =>
    console.log(
      `M${String(m.month).padStart(2)} ${(m.ebitda / 1e3).toFixed(0).padStart(6)} ${(m.cash / 1e3).toFixed(0).padStart(7)} ` +
      `${m.runwayMonths === null ? '  n.a.' : m.runwayMonths.toFixed(1).padStart(6)} ${m.nrrAnnualized === null ? '' : (m.nrrAnnualized * 100).toFixed(1)}`,
    ),
  );
  res.warnings.forEach((w) => console.log('ALERTE', w.code, w.message));
  res.departments.forEach((d) =>
    console.log(`dept ${d.name}: coût ${(d.annualCost / 1e3).toFixed(0)} k / env ${d.envelope === null ? '-' : (d.envelope / 1e3).toFixed(0)} k`),
  );
}
