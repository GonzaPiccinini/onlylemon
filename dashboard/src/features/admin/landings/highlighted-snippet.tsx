import { type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { type ExamplePart, type ModeExample } from "./embed-install";

// ---------------------------------------------------------------------------
// Presentational-only: renders a `ModeExample` as one or more snippets shown in
// realistic HTML context, PAINTING the exact piece the owner has to add (the
// <div>, the data-cta attribute, or the <script>). Seeing the piece surrounded
// by context (e.g. the <script> sitting right before </body></html>) tells a
// non-technical owner WHERE it goes, not just what it is. A warning below spells
// out what breaks if they skip a piece.
//
// The painted piece is never injected as HTML: `code` is split around the
// `highlight` substring with a plain `indexOf` and rendered as React text nodes
// (no dangerouslySetInnerHTML). Context (the un-highlighted remainder) is dimmed
// so the addition stands out.
// ---------------------------------------------------------------------------

/** Distinguishable by weight + ring, not color alone, so it isn't relying on hue. */
const PAINTED_CLASS = "rounded bg-primary/15 px-1 font-semibold text-primary ring-1 ring-primary/30";

/**
 * Renders `code` as mono text with the `highlight` substring painted as "what
 * you add"; the rest is dimmed context. If `highlight` is absent or not found,
 * the whole snippet is painted (used when the entire block is the addition).
 */
function PaintedCode({ code, highlight }: { code: string; highlight?: string }) {
  const index = highlight ? code.indexOf(highlight) : -1;

  if (!highlight || index === -1) {
    return (
      <code className="font-mono text-sm text-muted-foreground">
        <span className={cn("not-italic", PAINTED_CLASS)}>{code}</span>
      </code>
    );
  }

  return (
    <code className="font-mono text-sm text-muted-foreground">
      {code.slice(0, index)}
      <span className={cn("not-italic", PAINTED_CLASS)}>
        {code.slice(index, index + highlight.length)}
      </span>
      {code.slice(index + highlight.length)}
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

/** One example part: a heading + caption, then a painted snippet (or Antes/Después). */
function ExamplePartView({ part }: { part: ExamplePart }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{part.label}</span>
      <p className="text-sm text-muted-foreground">{part.caption}</p>

      {part.before ? (
        <div className="flex flex-col gap-2">
          <SnippetRow label="Antes">
            <code className="font-mono text-sm text-muted-foreground">{part.before}</code>
          </SnippetRow>
          <SnippetRow label="Después">
            <PaintedCode code={part.code} highlight={part.highlight} />
          </SnippetRow>
        </div>
      ) : (
        <SnippetRow>
          <PaintedCode code={part.code} highlight={part.highlight} />
        </SnippetRow>
      )}
    </div>
  );
}

/**
 * Shows a `ModeExample`: each part painted in context, then a warning that
 * makes the stakes explicit ("si no pegás el script, no funciona").
 */
export function HighlightedSnippet({ example }: { example: ModeExample }) {
  return (
    <div className="flex flex-col gap-4">
      {example.parts.map((part, index) => (
        <ExamplePartView key={`${part.label}-${index}`} part={part} />
      ))}

      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{example.warning}</span>
      </div>
    </div>
  );
}
