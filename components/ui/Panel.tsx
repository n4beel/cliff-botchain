import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
}

/** A white card on light stock: soft radius, hairline border, the faintest lift. */
export default function Panel({ elevated, noPadding, children, className = "", style, ...props }: PanelProps) {
  return (
    <div
      className={[noPadding ? "" : "p-6", className].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        boxShadow: elevated ? "none" : "0 1px 2px rgba(27,31,26,0.04)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
