import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Embed snippet builder — the templates below MUST stay byte-identical to the
// output the worker expects. Only the display labels are UI concerns.
// ---------------------------------------------------------------------------

export type EmbedMode = "boton-flotante" | "widget-automontado" | "solo-logica";

/** Short labels for the segmented control. Values feed `data-cta-mode`. */
export const EMBED_MODES: { value: EmbedMode; label: string }[] = [
  { value: "boton-flotante", label: "Botón flotante" },
  { value: "widget-automontado", label: "Widget" },
  { value: "solo-logica", label: "Solo lógica" },
];

/** One-line, plain-language helper shown under the snippet for each mode. */
export const EMBED_MODE_HINT: Record<EmbedMode, string> = {
  "boton-flotante": "Pegá esto antes de </body> en tu landing.",
  "widget-automontado": "Pegá esto antes de </body> en tu landing.",
  "solo-logica": "Pegá esto antes de </body> en tu landing.",
};

/** Strip the /api suffix from the dashboard API base URL to get the worker root. */
const workerBase = env.apiBaseUrl.replace(/\/api$/, "");

export function buildSnippet(landingId: string, mode: EmbedMode): string {
  const scriptTag = `<script src="${workerBase}/embed/${landingId}.js" data-cta-mode="${mode}" async></script>`;

  if (mode === "boton-flotante") {
    return scriptTag;
  }

  if (mode === "widget-automontado") {
    return `<div id="cta-root"></div>\n${scriptTag}`;
  }

  // solo-logica: owner must provide a [data-cta] button and a [data-cta-captcha] container
  return [
    `<!-- Botón de CTA (atributo data-cta requerido) -->`,
    `<button type="button" data-cta>Contactarse</button>`,
    `<!-- Contenedor para el captcha (atributo data-cta-captcha requerido) -->`,
    `<div data-cta-captcha></div>`,
    scriptTag,
  ].join("\n");
}
