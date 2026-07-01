import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Minimal, dependency-free HTML tokenizer.
//
// It produces coloured spans for tags, attributes, string values and comments
// so the surface unmistakably reads as code — without pulling in a full syntax
// highlighter. It never uses dangerouslySetInnerHTML: every token becomes a
// React node, so arbitrary snippet content stays inert. All colours come from
// centralized theme tokens so the surface blends in both themes.
// ---------------------------------------------------------------------------

type TokenKind =
  | "comment"
  | "punct"
  | "tag"
  | "attr"
  | "string"
  | "plain";

const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-muted-foreground italic",
  punct: "text-muted-foreground",
  tag: "text-primary",
  attr: "text-foreground/70",
  string: "text-foreground",
  plain: "text-foreground",
};

// Order matters: comments and strings are matched before brackets and words.
const TOKEN_RE =
  /(<!--[\s\S]*?-->)|("[^"]*"|'[^']*')|(<\/?|\/?>|>)|([A-Za-z][\w:.-]*)|(\s+)|([^\s<>"']+)/g;

function tokenizeLine(line: string): { kind: TokenKind; value: string }[] {
  const tokens: { kind: TokenKind; value: string }[] = [];
  let inTag = false;
  let expectTagName = false;

  for (const match of line.matchAll(TOKEN_RE)) {
    const [, comment, str, bracket, word, ws, other] = match;

    if (comment !== undefined) {
      tokens.push({ kind: "comment", value: comment });
    } else if (str !== undefined) {
      tokens.push({ kind: inTag ? "string" : "plain", value: str });
    } else if (bracket !== undefined) {
      if (bracket === "<" || bracket === "</") {
        inTag = true;
        expectTagName = true;
      } else {
        inTag = false;
        expectTagName = false;
      }
      tokens.push({ kind: "punct", value: bracket });
    } else if (word !== undefined) {
      if (!inTag) {
        tokens.push({ kind: "plain", value: word });
      } else if (expectTagName) {
        expectTagName = false;
        tokens.push({ kind: "tag", value: word });
      } else {
        tokens.push({ kind: "attr", value: word });
      }
    } else if (ws !== undefined) {
      tokens.push({ kind: "plain", value: ws });
    } else if (other !== undefined) {
      tokens.push({ kind: "punct", value: other });
    }
  }

  return tokens;
}

function highlight(code: string): ReactNode[] {
  return code.split("\n").map((line, lineIndex) => {
    const tokens = tokenizeLine(line);
    return (
      <div key={lineIndex} className="table-row">
        <span className="table-cell w-8 pr-4 text-right text-muted-foreground/50 select-none tabular-nums">
          {lineIndex + 1}
        </span>
        <span className="table-cell whitespace-pre-wrap break-all">
          {tokens.length === 0 ? (
            " "
          ) : (
            tokens.map((token, tokenIndex) => (
              <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                {token.value}
              </span>
            ))
          )}
        </span>
      </div>
    );
  });
}

/**
 * Snippets taller than this (rendered, after wrapping) collapse behind a
 * "Ver código completo" toggle. Measured against actual pixel height so it
 * fires for short-but-tall wrapped snippets, not a fixed line count. Matches
 * the collapsed `max-h-52` clamp below.
 */
const COLLAPSE_MAX_HEIGHT = 208;

interface CodeBlockProps {
  code: string;
  /** Accessible label for the copy button. */
  copyLabel?: string;
  className?: string;
}

/**
 * A subtle, recessed code surface that blends with the UI (not a dark floating
 * card). Line numbers, dimmed comments and token-coloured tags make the
 * structure legible. Long snippets collapse behind a fade + toggle. Includes a
 * copy button with copy → check feedback.
 */
export function CodeBlock({ code, copyLabel = "Copiar código", className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const rendered = useMemo(() => highlight(code), [code]);
  const preRef = useRef<HTMLPreElement>(null);

  // Decide collapsibility from ACTUAL rendered height (accounting for wrapping),
  // not a line count. `scrollHeight` reports the full content height even while
  // the element is clamped, so re-measuring stays stable across collapse toggles.
  // A ResizeObserver keeps the decision correct as the viewport width changes.
  useLayoutEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const measure = () => setCollapsible(el.scrollHeight > COLLAPSE_MAX_HEIGHT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [code]);

  const collapsed = collapsible && !expanded;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context) — silently ignore.
    }
  };

  return (
    <div
      className={cn(
        "group/code relative overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        aria-label={copied ? "Copiado" : copyLabel}
        className="absolute right-2 top-2 z-10 gap-1.5"
      >
        {copied ? (
          <>
            <CheckIcon data-icon="inline-start" className="text-success" />
            Copiado
          </>
        ) : (
          <>
            <CopyIcon data-icon="inline-start" />
            Copiar
          </>
        )}
      </Button>

      <div className="relative">
        <pre
          ref={preRef}
          className={cn(
            "scrollbar-thin p-4 pr-24 text-sm leading-relaxed transition-[max-height] duration-300 motion-reduce:transition-none",
            collapsed && "max-h-52 overflow-y-hidden",
          )}
        >
          <code className="table font-mono">{rendered}</code>
        </pre>

        {collapsed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
          />
        )}
      </div>

      {collapsible && (
        <div className="flex justify-center border-t border-border p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="gap-1.5 text-muted-foreground"
          >
            <ChevronDownIcon
              data-icon="inline-start"
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
            {expanded ? "Ver menos" : "Ver código completo"}
          </Button>
        </div>
      )}
    </div>
  );
}
