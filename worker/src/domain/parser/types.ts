export const PARSER_INTENTS = {
  CREATE_USER: 'CREAR_USUARIO',
  DEPOSIT: 'CARGAR_SALDO',
  UNKNOWN: 'DESCONOCIDO',
} as const;

export type ParserIntent = (typeof PARSER_INTENTS)[keyof typeof PARSER_INTENTS];

export type ParserEntities = {
  nombre: string | null;
  monto: number | null;
};

export type MessageParseResult = {
  intent: ParserIntent;
  entities: ParserEntities;
};

export type MessageParser = {
  parse(message: string): Promise<MessageParseResult>;
};
