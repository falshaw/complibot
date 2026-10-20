/** Soft blurred colour blobs that sit behind the glass panels. */
export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden>
      <i
        style={{
          width: 620,
          height: 620,
          left: -160,
          top: -180,
          background: "var(--blob1)",
        }}
      />
      <i
        style={{
          width: 520,
          height: 520,
          right: -120,
          top: 120,
          background: "var(--blob2)",
        }}
      />
      <i
        style={{
          width: 640,
          height: 640,
          left: "30%",
          bottom: -320,
          background: "var(--blob3)",
        }}
      />
    </div>
  );
}

/** The CompliBot logo mark: a shield with a tick on the gradient tile. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="logo-tile"
      style={{ width: size, height: size, borderRadius: size / 3 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        width={size / 2}
        height={size / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </svg>
    </span>
  );
}

/** "Compli" + accent "Bot" word mark. */
export function WordMark() {
  return (
    <span>
      Compli<span className="text-accent">Bot</span>
    </span>
  );
}
