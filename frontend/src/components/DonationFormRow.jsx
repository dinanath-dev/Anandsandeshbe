/**
 * Two-column row: label (right-aligned on sm+) + field — wrapper uses `contents` so rows join parent grid.
 */
export default function DonationFormRow({ label, required, error, children, labelFor }) {
  const LabelTag = labelFor ? 'label' : 'div';
  const labelProps = labelFor ? { htmlFor: labelFor } : {};

  return (
    <div className="contents">
      <LabelTag {...labelProps} className={`donation-form-label ${labelFor ? 'cursor-pointer' : ''}`}>
        {label}
        {required ? <span className="text-ink"> *</span> : null}
      </LabelTag>
      <div className="donation-form-field min-w-0">
        {children}
        {error ? <p className="donation-form-hint">{error}</p> : null}
      </div>
    </div>
  );
}
