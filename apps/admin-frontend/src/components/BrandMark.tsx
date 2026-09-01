/**
 * The app's mark: a chain link (🔗). Inline SVG rather than an asset file so it
 * inherits the Kumo text color in both themes and adds no request.
 *
 * The collapsed sidebar rail has room for an icon and nothing else, so this is
 * the only brand element that survives a collapse — see `docs/ux.md`.
 */
export function BrandMark({ className = 'h-5 w-5 shrink-0' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M12.7 6.3 14.8 4.2a4.5 4.5 0 0 1 6.4 6.4l-2.1 2.1" />
      <path d="M11.3 17.7 9.2 19.8a4.5 4.5 0 0 1-6.4-6.4l2.1-2.1" />
    </svg>
  );
}
