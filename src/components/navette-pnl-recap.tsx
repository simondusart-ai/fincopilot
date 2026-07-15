/**
 * Tableau recapitulatif "P&L du departement" affiche en tete de la navette.
 * Composant strictement PRESENTATIONNEL : il ne recalcule rien. Il recoit les sous-totaux
 * trimestriels deja produits par les memes fonctions que les sections de saisie (une ligne
 * par section reellement presente), ce qui garantit la coherence a l'euro pres avec elles.
 *
 * Convention d'affichage : montants en k€ (comme le P&L consolide), tabular-nums alignes a
 * droite. La Topline est une ligne de revenu (hors total des couts) ; les sections de cout
 * somment dans "Total couts du departement". L'enveloppe et l'ecart ne portent qu'un total
 * annuel (l'enveloppe de cadrage est annuelle, sans ventilation trimestrielle).
 */

/** Une ligne du recap = une section presente dans le departement, avec ses 4 trimestres (euros). */
export interface PnlRecapRow {
  id: string;
  title: string;
  /** true si la section compte dans le total des couts ; false pour la Topline. */
  isCost: boolean;
  quarters: number[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const k = (eur: number) => Math.round(eur / 1000).toLocaleString('fr-FR');

export function NavettePnlRecap({
  budgetYear,
  rows,
  envelope,
}: {
  budgetYear: number;
  rows: PnlRecapRow[];
  envelope: number | null;
}) {
  const costRows = rows.filter((r) => r.isCost);
  const totalCostQuarters = [0, 1, 2, 3].map((i) => sum(costRows.map((r) => r.quarters[i] ?? 0)));
  const totalCostAnnual = sum(totalCostQuarters);
  const ecartAnnual = envelope != null ? envelope - totalCostAnnual : null;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline gap-2 px-5 pt-5">
        <h2 className="font-semibold text-ink">P&amp;L du département</h2>
        <span className="text-xs text-ink/50">Exercice {budgetYear} · en k€</span>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-lav text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-5 py-3 font-semibold">Ligne</th>
              <th className="px-3 py-3 text-right font-semibold">T1</th>
              <th className="px-3 py-3 text-right font-semibold">T2</th>
              <th className="px-3 py-3 text-right font-semibold">T3</th>
              <th className="px-3 py-3 text-right font-semibold">T4</th>
              <th className="px-5 py-3 text-right font-semibold">Total année</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-lav/60 ${r.isCost ? '' : 'bg-mint/10'}`}>
                <td className="px-5 py-2">{r.title}</td>
                {[0, 1, 2, 3].map((i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">{k(r.quarters[i] ?? 0)}</td>
                ))}
                <td className="px-5 py-2 text-right font-semibold tabular-nums">{k(sum(r.quarters))}</td>
              </tr>
            ))}

            {/* Solde : total des couts du departement (Topline exclue) */}
            <tr className="bg-lav">
              <td className="px-5 py-2 font-semibold">Total coûts du département</td>
              {totalCostQuarters.map((v, i) => (
                <td key={i} className="px-3 py-2 text-right font-semibold tabular-nums">{k(v)}</td>
              ))}
              <td className="px-5 py-2 text-right font-semibold tabular-nums">{k(totalCostAnnual)}</td>
            </tr>

            {/* Enveloppe et ecart : seulement si une enveloppe de cadrage existe */}
            {envelope != null && (
              <>
                <tr className="border-b border-lav/60">
                  <td className="px-5 py-2 text-ink/60">Enveloppe globale</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-5 py-2 text-right tabular-nums text-ink/60">{k(envelope)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-2 text-ink/60">Écart vs enveloppe</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className={`px-5 py-2 text-right tabular-nums ${ecartAnnual != null && ecartAnnual < 0 ? 'text-red-600' : 'text-ink/60'}`}>
                    {k(ecartAnnual ?? 0)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
