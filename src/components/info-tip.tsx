/**
 * Petite infobulle "?" accessible : visible au survol ET au focus clavier (le "?" est
 * focusable), avec l'attribut title en repli natif. Purement presentationnel.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        title={text}
        aria-label={text}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-lav text-[10px] font-semibold text-ink/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 max-w-[80vw] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
