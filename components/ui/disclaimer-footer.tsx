/**
 * DisclaimerFooter — mandatory on every report and letter surface.
 * Non-dismissible by contract (masterplan §2.2): no close affordance, no
 * conditional rendering flags. Legal copy is a pre-launch counsel review item.
 */
export function DisclaimerFooter() {
  return (
    <footer
      role="contentinfo"
      className="mt-8 rounded-md border border-ink-700 bg-ink-900 px-4 py-3"
    >
      <p className="text-caption leading-relaxed text-ink-400">
        BankGuard AI provides an informational diagnostic based on probabilistic
        analysis of observed language patterns and cited regulatory material. It
        is not legal advice, does not establish an attorney–client relationship,
        and does not assert any institution&apos;s internal decision-making.
        Banks are legally constrained from disclosing certain closure
        reasoning; no analysis can establish it with certainty. Consult a
        licensed attorney for legal questions about your situation.
      </p>
    </footer>
  );
}
