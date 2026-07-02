import { type EmbedMode } from "./embed";

// ---------------------------------------------------------------------------
// Install guides indexed by MODE × PLATFORM, written for non-technical shop
// owners. Unlike a flat, mode-agnostic guide, the real steps (and whether the
// mode is even possible) differ per platform: e.g. Tienda Nube has no visual
// "custom code" block, so "widget-automontado" and "solo-logica" can't be done
// natively there, while "boton-flotante" needs Google Tag Manager (needs-code,
// paid plans only). `INTEGRATION[mode][platform]` is the single source of
// truth for that per-cell reality; steps were verified against each
// platform's official help docs (see `sourceUrl`).
//
// `feasibility` drives the UI treatment for a cell:
//   - "ok"          → a non-technical owner can do it alone, show the steps.
//   - "needs-code"  → requires editing theme/template code (technical
//                     profile); steps are still shown, plus a `recommend`
//                     hint toward the easier mode when one exists.
//   - "not-viable"  → impossible with the platform's native tools; `steps`
//                     is a short, honest explanation of why, and `recommend`
//                     always points to the mode that DOES work there.
//
// `MODE_EXAMPLE` is separate: one highlighted before/after code example per
// MODE (not per platform) that teaches what the owner actually adds. The
// per-platform guides above only change WHERE to paste it.
// ---------------------------------------------------------------------------

export type PlatformId = "wordpress" | "tiendanube" | "shopify" | "wix" | "html";

export type Feasibility = "ok" | "needs-code" | "not-viable";

export type IntegrationGuide = {
  feasibility: Feasibility;
  /** Plain-language, concrete numbered steps. Assume the snippet is already copied. */
  steps: string[];
  /** One critical caveat, if any. */
  gotcha?: string;
  /** Official doc verified against. */
  sourceUrl?: string;
  /** When feasibility is not "ok", the mode that DOES work well on this platform. */
  recommend?: EmbedMode;
};

export const PLATFORMS: { id: PlatformId; name: string }[] = [
  { id: "wordpress", name: "WordPress" },
  { id: "tiendanube", name: "Tienda Nube" },
  { id: "shopify", name: "Shopify" },
  { id: "wix", name: "Wix" },
  { id: "html", name: "HTML / otra plataforma" },
];

// INTEGRATION[mode][platform] — one guide per cell (3 modes × 5 platforms = 15).
export const INTEGRATION: Record<EmbedMode, Record<PlatformId, IntegrationGuide>> = {
  "boton-flotante": {
    html: {
      feasibility: "ok",
      steps: [
        "Abrí el editor de código de tu página (o el archivo .html).",
        "Buscá la etiqueta </body>, casi al final del código.",
        "Pegá el código que copiaste justo antes de esa etiqueta.",
        "Guardá y publicá los cambios.",
      ],
    },
    wordpress: {
      feasibility: "ok",
      steps: [
        'En el panel de WordPress (wp-admin) entrá a Plugins → Añadir nuevo, buscá "WPCode", instalalo y activalo.',
        "En el menú de la izquierda andá a Code Snippets → Header & Footer.",
        'Pegá el código que copiaste en la caja "Footer" (Pie de página).',
        'Tocá "Save Changes" arriba a la derecha.',
      ],
      gotcha:
        'Los plugins de caché con "Delay JS" retrasan la aparición del botón; excluí el script de esa optimización.',
      sourceUrl: "https://wpcode.com/docs/using-the-global-header-footer-settings/",
    },
    shopify: {
      feasibility: "ok",
      steps: [
        'En el admin de Shopify andá a Tienda online → Temas (Online Store → Themes) y tocá "Personalizar" (Customize) en tu tema activo.',
        'Bajá hasta la sección "Pie de página" (Footer).',
        'Tocá "Añadir sección" (Add section) y elegí "Liquid personalizado" (Custom Liquid).',
        "Pegá el código que copiaste dentro de esa sección.",
        'Tocá "Guardar" (Save).',
      ],
      gotcha:
        'Esto depende de que tu tema ofrezca la sección "Liquid personalizado". En temas más viejos (vintage) hay que editarlo a mano en theme.liquid.',
      sourceUrl:
        "https://help.shopify.com/en/manual/online-store/themes/customizing-themes/apps",
    },
    wix: {
      feasibility: "ok",
      steps: [
        "Entrá al panel de tu sitio y andá a Configuración (Settings).",
        'En "Desarrollo e integraciones" tocá "Código personalizado" (Custom Code).',
        'Tocá "+ Añadir código personalizado" y pegá el código que copiaste.',
        'Elegí ubicación "Cuerpo - final" (Body - end) y alcance "Todas las páginas".',
        'Tocá "Aplicar" (Apply) y publicá el sitio.',
      ],
      gotcha:
        "Necesitás un plan Premium con dominio conectado y el sitio publicado; si no ves esta opción, tu plan puede no permitir código personalizado.",
      sourceUrl: "https://support.wix.com/en/article/wix-editor-embedding-custom-code-on-your-site",
    },
    tiendanube: {
      feasibility: "needs-code",
      steps: [
        "Si todavía no tenés Google Tag Manager, creá una cuenta en tagmanager.google.com y copiá tu ID de contenedor (GTM-XXXXXXX).",
        "En el administrador de tu tienda andá a Configuración → Códigos externos → Google Tag Manager y pegá ese ID.",
        'En Google Tag Manager, creá una etiqueta nueva de tipo "HTML personalizado" y pegá el código que copiaste.',
        'Elegí el activador "Todas las páginas" (All Pages) para esa etiqueta.',
        'Tocá "Enviar" (Submit) y publicá el contenedor de GTM.',
      ],
      gotcha:
        'Google Tag Manager solo está disponible en planes pagos de Tienda Nube. El campo viejo "Para la Tienda" fue desactivado el 03/03/2024 y ya no existe.',
      sourceUrl: "https://ayuda.tiendanube.com/es_MX/como-instalar-google-tag-manager-en-mi-tiendanube",
    },
  },
  "widget-automontado": {
    html: {
      feasibility: "ok",
      steps: [
        "Abrí el editor de código de tu página (o el archivo .html).",
        "Pegá el bloque <div id=\"cta-root\"></div> en el lugar exacto donde querés que aparezca el botón.",
        "Buscá la etiqueta </body>, casi al final del código.",
        "Pegá el segundo bloque (el código) justo antes de esa etiqueta.",
        "Guardá y publicá los cambios.",
      ],
    },
    wordpress: {
      feasibility: "ok",
      steps: [
        'Instalá WPCode (Plugins → Añadir nuevo → "WPCode") y activalo, si todavía no lo tenés.',
        'En Code Snippets → Header & Footer, pegá el segundo bloque (el código) en "Footer" y guardá — así queda disponible en todo el sitio.',
        'Editá la página donde querés el botón y agregá un bloque "HTML personalizado" (escribí /html en el editor de Gutenberg).',
        'Pegá dentro de ese bloque HTML el <div id="cta-root"></div> (el primer bloque del código de arriba).',
        "Publicá o actualizá la página.",
      ],
      gotcha:
        "No pegues el código (el <script>) dentro del bloque HTML personalizado de la página: va sitewide por WPCode, no por página.",
      sourceUrl: "https://wordpress.org/documentation/article/custom-html/",
    },
    shopify: {
      feasibility: "ok",
      steps: [
        "En Tienda online → Temas → Personalizar, elegí la plantilla (por ejemplo, la página de un producto) donde querés el botón.",
        'Tocá "Añadir sección" (Add section) y elegí "Liquid personalizado" (Custom Liquid).',
        'Pegá los dos bloques del código —el <div id="cta-root"></div> y el <script>— juntos, dentro de esa sección.',
        "Arrastrá la sección a la posición donde querés que aparezca el botón.",
        'Tocá "Guardar" (Save).',
      ],
      gotcha:
        "No es sitewide: tenés que repetir estos pasos en cada plantilla donde quieras el botón (inicio, producto, etc.).",
      sourceUrl:
        "https://help.shopify.com/en/manual/online-store/themes/customizing-themes/apps",
    },
    wix: {
      feasibility: "not-viable",
      steps: [
        'En Wix, el bloque de "HTML" (iFrame) renderiza aislado en un iframe sandboxed, separado del resto de tu página.',
        'El script del botón corre en tu página principal y nunca puede "ver" el <div id="cta-root"> metido dentro de ese iframe, así que el widget no puede montarse ahí.',
      ],
      sourceUrl:
        "https://dev.wix.com/docs/velo/velo-only-apis/$w/html-i-frame-element/working-with-the-html-iframe-element",
      recommend: "boton-flotante",
    },
    tiendanube: {
      feasibility: "not-viable",
      steps: [
        'El editor de diseño de Tienda Nube no tiene un bloque de "HTML personalizado" donde pegar el <div id="cta-root"></div>.',
        "La única forma de lograrlo es editando el archivo Layout.tpl del tema por FTP, algo que requiere un desarrollador.",
      ],
      recommend: "boton-flotante",
    },
  },
  "solo-logica": {
    html: {
      feasibility: "ok",
      steps: [
        "Abrí el editor de código de tu página (o el archivo .html).",
        "Buscá el botón que ya tenés y agregale el atributo data-cta.",
        "Buscá la etiqueta </body>, casi al final del código.",
        "Pegá el código que copiaste justo antes de esa etiqueta.",
        "Guardá y publicá los cambios.",
      ],
    },
    wordpress: {
      feasibility: "needs-code",
      steps: [
        'Editá el bloque de tu botón y cambialo a "Editar como HTML" (los tres puntos del bloque → Editar como HTML).',
        "Agregale el atributo data-cta a la etiqueta del botón, tal como en el ejemplo.",
        "Si usás un page builder con soporte de atributos personalizados (por ejemplo Elementor Pro → Avanzado → Atributos), cargalo ahí en vez de editar HTML a mano.",
        'Pegá el código (el <script>) en "Footer" con WPCode, como en los otros modos.',
      ],
      gotcha:
        "El editor visual de Gutenberg borra los atributos data-* al guardar un botón normal; solo funciona editando el HTML del bloque a mano o con un page builder Pro.",
      sourceUrl: "https://github.com/WordPress/gutenberg/issues/16164",
      recommend: "widget-automontado",
    },
    shopify: {
      feasibility: "needs-code",
      steps: [
        'En Tienda online → Temas, tocá el botón "..." de tu tema y elegí "Editar código" (Edit code).',
        "Buscá el archivo .liquid donde está el botón que querés usar.",
        "Agregale el atributo data-cta a la etiqueta del botón, tal como en el ejemplo.",
        "Guardá el archivo.",
      ],
      gotcha:
        "Antes de tocar el código, duplicá el tema como respaldo: un error de tipeo puede romper la sección.",
      sourceUrl: "https://help.shopify.com/en/manual/online-store/themes/extend/theme-code",
      recommend: "widget-automontado",
    },
    wix: {
      feasibility: "not-viable",
      steps: [
        "Wix no permite agregar atributos personalizados (como data-cta) a los botones nativos de su editor, ni desde la interfaz ni desde Velo.",
        "Sin ese atributo, el script no tiene forma de identificar tu botón, así que este modo no se puede usar en Wix.",
      ],
      sourceUrl: "https://dev.wix.com/docs/velo/velo-only-apis/$w/custom-element/set-attribute",
      recommend: "boton-flotante",
    },
    tiendanube: {
      feasibility: "needs-code",
      steps: [
        "Tienda Nube no tiene un bloque de código ni una forma nativa de agregar el atributo data-cta a un botón desde el editor.",
        "Tanto el script como el atributo solo se pueden agregar editando el tema (Layout.tpl) por FTP, algo que requiere un desarrollador.",
        "Mientras tanto, te recomendamos usar el modo Botón flotante, que sí funciona en Tienda Nube sin tocar el tema (vía Google Tag Manager).",
      ],
      sourceUrl: "https://ayuda.tiendanube.com/es_MX/123368-codigos-externos",
      recommend: "boton-flotante",
    },
  },
};

export type ModeExample = {
  /** Code shown; the `highlight` substring within it is painted as "what you add". */
  code: string;
  /** Substring of `code` to paint. If omitted, the whole `code` is painted. */
  highlight?: string;
  /** For solo-logica: the "before" state shown above `code`, dimmed, unpainted. */
  before?: string;
  /** Short caption under the example. */
  caption: string;
};

export const MODE_EXAMPLE: Record<EmbedMode, ModeExample> = {
  "boton-flotante": {
    code: `<script src="https://…/tu-boton.js" data-cta-mode="boton-flotante" async></script>`,
    caption: "Pegás este código tal cual. No hay que tocar el diseño de tu página.",
  },
  "widget-automontado": {
    code: `<div id="cta-root"></div>`,
    caption: "Pegás este bloque en el lugar donde querés que aparezca el botón.",
  },
  "solo-logica": {
    before: `<button>Contactar</button>`,
    code: `<button data-cta>Contactar</button>`,
    highlight: "data-cta",
    caption: "Le agregás data-cta a tu botón, así:",
  },
};
