export const OPENAI_INTENT_MODEL = 'gpt-5-nano';

export const INTENT_EXTRACTION_PROMPT_TEMPLATE = `Sos un parser de mensajes de usuarios para un chatbot financiero.

Tu única tarea es extraer la intención y entidades del mensaje.

-----------------------
INTENCIONES POSIBLES
-----------------------
- SALUDO
- CREAR_USUARIO
- CARGAR_SALDO
- ATENCION_SOPORTE
- DESCONOCIDO

-----------------------
ENTIDADES
-----------------------
- nombre: string | null
- monto: number | null (SIEMPRE número entero en pesos argentinos)

-----------------------
REGLAS
-----------------------
- Respondé SOLO en JSON válido
- NO agregues texto extra
- NO expliques nada
- Si no hay datos → null
- Convertí:
  - "5 lucas" → 5000
  - "2k" → 2000
- Detectá nombres propios (ej: "juan", "pedro")
- Si el usuario dice su nombre → CREAR_USUARIO
- Si habla de dinero/fichas → CARGAR_SALDO
- Si no está claro → DESCONOCIDO

-----------------------
FORMATO OBLIGATORIO
-----------------------
{
  "intent": "CREAR_USUARIO" | "CARGAR_SALDO" | "DESCONOCIDO",
  "entities": {
    "nombre": string | null,
    "monto": number | null,
  }
}

-----------------------
MENSAJE
-----------------------
"\${mensaje}".`;

export function buildIntentExtractionPrompt(message: string) {
  return INTENT_EXTRACTION_PROMPT_TEMPLATE.replace('\${mensaje}', message);
}
