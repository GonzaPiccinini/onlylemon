// ---------------------------------------------------------------------------
// Platform-by-platform install guides for pasting the embed snippet, written
// for non-technical shop owners. Steps were verified against each platform's
// official help docs (see `sourceUrl`). Keep them short and jargon-free; the
// snippet placement is "sitewide / before </body>" in every case.
// ---------------------------------------------------------------------------

export type PlatformGuide = {
  id: string;
  name: string;
  /** 3-6 short, plain-language steps. Assumes the code is already copied. */
  steps: string[];
  /** One-line caveat or fallback. */
  note?: string;
  /** Official help article the steps were verified against. */
  sourceUrl?: string;
};

export const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    id: "wordpress",
    name: "WordPress",
    steps: [
      'En el panel de WordPress (wp-admin) entrá a Plugins → Añadir nuevo, buscá "WPCode", instalalo y activalo.',
      "En el menú de la izquierda andá a Code Snippets → Header & Footer.",
      'Pegá el código que copiaste en la caja "Footer" (Pie de página).',
      'Tocá "Save Changes" arriba a la derecha.',
    ],
    note: "Si ya tenés un plugin de encabezado/pie instalado, usá ese y pegá en su campo Footer; no instales dos a la vez.",
    sourceUrl: "https://wpcode.com/docs/using-the-global-header-footer-settings/",
  },
  {
    id: "tiendanube",
    name: "Tienda Nube",
    steps: [
      "En el administrador de tu tienda andá a Configuración → Códigos externos.",
      'Bajá hasta la sección "Códigos de tracking".',
      'Pegá el código que copiaste en el campo "Para la Tienda".',
      'Tocá "Guardar" al final de la página.',
    ],
    note: 'Tienda Nube no tiene un campo literal "antes de </body>", pero "Para la Tienda" carga el código en todas las páginas de tu tienda, que es justo lo que necesita.',
    sourceUrl:
      "https://ayuda.tiendanube.com/es_MX/para-que-sirve-el-campo-codigos-de-tracking-de-mi-tienda",
  },
  {
    id: "wix",
    name: "Wix",
    steps: [
      "Entrá al panel de tu sitio y andá a Configuración (Settings).",
      'En "Desarrollo e integraciones" tocá "Código personalizado" (Custom Code).',
      'Arriba a la derecha tocá "+ Agregar código personalizado".',
      "Pegá el código que copiaste y ponele un nombre para reconocerlo.",
      'Elegí "Todas las páginas" y en ubicación elegí "Cuerpo - final" (Body - end).',
      'Tocá "Aplicar" y publicá el sitio.',
    ],
    note: "El código solo funciona si tu sitio está publicado y con dominio conectado (plan pago). Si no ves esta opción, tu plan puede no permitir código personalizado.",
    sourceUrl:
      "https://support.wix.com/en/article/wix-editor-embedding-custom-code-on-your-site",
  },
  {
    id: "shopify",
    name: "Shopify",
    steps: [
      "En el admin de Shopify andá a Tienda online → Temas (Online Store → Themes).",
      'En tu tema actual tocá el botón "..." y elegí "Editar código" (Edit code).',
      'En la carpeta "Layout" abrí el archivo theme.liquid.',
      "Buscá la etiqueta </body> cerca del final y pegá el código justo antes.",
      'Tocá "Guardar" (Save).',
    ],
    note: "Antes de tocar el código, duplicá el tema como respaldo desde el botón «...»: los cambios se pierden si actualizás el tema.",
    sourceUrl:
      "https://help.shopify.com/en/manual/online-store/themes/customizing-themes/edit-code/edit-theme-code",
  },
  {
    id: "html",
    name: "HTML / otra plataforma",
    steps: [
      "Abrí el editor de código de tu página (o el archivo .html).",
      "Buscá la etiqueta </body>, casi al final del código.",
      "Pegá el código que copiaste justo antes de esa etiqueta </body>.",
      "Guardá y publicá los cambios.",
    ],
    note: 'Si usás otra plataforma, buscá en su panel una sección de "código personalizado", "scripts" o "pie de página" y pegá el código ahí.',
  },
];
