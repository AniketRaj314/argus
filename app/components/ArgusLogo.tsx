export function ArgusMark({ className = "" }: { className?: string }) {
  return <span className={`argus-mark ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 64 64" role="img">
      <path className="argus-eye" d="M9.5 32c5.8-9.2 13.3-13.8 22.5-13.8S48.7 22.8 54.5 32C48.7 41.2 41.2 45.8 32 45.8S15.3 41.2 9.5 32Z" />
      <circle className="argus-iris" cx="32" cy="32" r="9.2" />
      <circle className="argus-pupil" cx="32" cy="32" r="3.7" />
      <path className="argus-signal" d="M46.5 13.2a9.5 9.5 0 0 1 7.1 7.2M47.5 19a3.8 3.8 0 0 1 2.8 2.8" />
    </svg>
  </span>;
}
