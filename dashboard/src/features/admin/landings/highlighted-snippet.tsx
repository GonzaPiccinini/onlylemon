import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type ModeExample } from "./embed-install";

// ---------------------------------------------------------------------------
// Presentational-only: renders a `ModeExample` and visibly PAINTS the piece
// the owner has to add, so the "what changes" reads at a glance without a
// full syntax highlighter. Mirrors `CodeBlock`'s surface (rounded, bordered,
// bg-background, mono) but skips the copy button and line numbers — this is
// a teaching snippet, not something meant to be copied verbatim.
//
// The painted piece is never injected as HTML: `code` is split around the
// `highlight` substring with a plain `indexOf` and rendered as React text
// nodes, so arbitrary content stays inert (no dangerouslySetInnerHTML).
// ---------------------------------------------------------------------------

/** Distinguishable by weight + ring, not just color, so it isn't relying on hue alone. */
const PAINTED_CLASS = "rounded bg-primary/15 px-1 font-semibold text-primary ring-1 ring-primary/30";

/**
 * Renders `code` as inline mono text with the `highlight` substring painted
 * as "what you add". If `highlight` is omitted (or not found in `code`), the
 * whole snippet is painted instead — that's the case for modes where the
 * entire pasted block is the addition (e.g. the FAB's single `<script>`).
 */
function PaintedCode({ code, highlight }: { code: string; highlight?: string }) {
  const index = highlight ? code.indexOf(highlight) : -1;

  if (!highlight || index === -1) {
    return (
      <code className="font-mono text-sm text-foreground/80">
        <span className={cn("not-italic", PAINTED_CLASS)}>{code}</span>
      </code>
    );
  }

  const before = code.slice(0, index);
  const match = code.slice(index, index + highlight.length);
  const after = code.slice(index + highlight.length);

  return (
    <code className="font-mono text-sm text-foreground/80">
      {before}
      <span className={cn("not-italic", PAINTED_CLASS)}>{match}</span>
      {after}
    </code>
  );
}

/** A single labeled code surface, matching `CodeBlock`'s rounded/bordered look. */
function SnippetRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

/**
 * Shows a `ModeExample`: the caption, then either a single painted snippet or
 * (when `before` is present) a dimmed "Antes" row followed by a painted
 * "Después" row — the before/after teaching pattern used for solo-logica.
 */
export function HighlightedSnippet({ example }: { example: ModeExample }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{example.caption}</p>

      <div className="flex flex-col gap-2">
        {example.before && (
          <SnippetRow label="Antes">
            <code className="font-mono text-sm text-muted-foreground">{example.before}</code>
          </SnippetRow>
        )}

        <SnippetRow label={example.before ? "Después" : undefined}>
          <PaintedCode code={example.code} highlight={example.highlight} />
        </SnippetRow>
      </div>
    </div>
  );
}
