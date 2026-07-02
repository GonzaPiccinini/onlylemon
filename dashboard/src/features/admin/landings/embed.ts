import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Embed snippet builder — the templates below MUST stay byte-identical to the
// output the worker expects. Only the display labels are UI concerns.
// ---------------------------------------------------------------------------

export type EmbedMode = "boton-flotante" | "widget-automontado" | "solo-logica";

/**
 * Plain-language description of each mode, written for shop owners who don't
 * code. Powers the mode intro card and the "¿cuál me conviene?" chooser dialog.
 */
export type EmbedModeInfo = {
  value: EmbedMode;
  /** Short label for the segmented control. */
  label: string;
  /** Two/three-word essence shown next to the label. */
  tagline: string;
  /** What the visitor actually sees/does on the merchant's page. */
  whatItDoes: string;
  /** Who should pick this — the deciding factor, in the chooser dialog. */
  bestFor: string;
};

/** Single source of truth for every mode's UI copy. Order = display order. */
export const EMBED_MODE_INFO: Record<EmbedMode, EmbedModeInfo> = {
  "boton-flotante": {
    value: "boton-flotante",
    label: "Botón flotante",
    tagline: "Aparece solo en tu página",
    whatItDoes:
      "Aparece un botón de WhatsApp fijo, abajo a la derecha de tu página. Al tocarlo se abre WhatsApp directamente, sin pasos intermedios.",
    bestFor:
      "Querés pegar un solo código y que el botón aparezca solo, sin tocar el diseño de tu página.",
  },
  "widget-automontado": {
    value: "widget-automontado",
    label: "Widget",
    tagline: "Integrado en tu página",
    whatItDoes:
      "El botón «Contactarse» aparece dentro del contenido de tu página, en el lugar exacto donde vos lo coloques.",
    bestFor:
      "Querés que el botón viva dentro de una sección (por ejemplo, debajo de un producto) en vez de flotar en la esquina.",
  },
  "solo-logica": {
    value: "solo-logica",
    label: "Solo lógica",
    tagline: "Usás tu propio botón",
    whatItDoes:
      "El código solo aporta el comportamiento. Vos ponés tu propio botón con el atributo indicado y el script se encarga del resto, incluido el captcha invisible.",
    bestFor:
      "Querés usar tu propio botón y controlar del todo su diseño y ubicación.",
  },
};

/** Short labels for the segmented control. Values feed `data-cta-mode`. */
export const EMBED_MODES: { value: EmbedMode; label: string }[] = Object.values(
  EMBED_MODE_INFO,
).map(({ value, label }) => ({ value, label }));

/** Strip the /api suffix from the dashboard API base URL to get the worker root. */
const workerBase = env.apiBaseUrl.replace(/\/api$/, "");

export type SnippetBlock = {
  /** Optional heading rendered above the block, telling the owner where it goes. */
  label?: string;
  code: string;
};

export function buildSnippetBlocks(landingId: string, mode: EmbedMode): SnippetBlock[] {
  const scriptTag = `<script src="${workerBase}/embed/${landingId}.js" data-cta-mode="${mode}" async></script>`;

  if (mode === "boton-flotante") {
    return [{ code: scriptTag }];
  }

  if (mode === "widget-automontado") {
    return [{ code: `<div id="cta-root"></div>\n${scriptTag}` }];
  }

  // solo-logica: the owner supplies their own [data-cta] button. The captcha is
  // an invisible proof-of-work solved by the script, so no container is needed.
  // Two blocks so a non-technical owner knows where each part goes.
  return [
    {
      label: "El botón · pegalo donde quieras que aparezca",
      code: `<button type="button" data-cta>Contactarse</button>`,
    },
    {
      label: "El script · pegalo al final de todo, antes de </body>",
      code: scriptTag,
    },
  ];
}
