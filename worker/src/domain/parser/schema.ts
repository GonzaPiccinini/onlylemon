import { z } from 'zod';

import { PARSER_INTENTS } from './types.js';

export const messageParseResultSchema = z.object({
  intent: z.enum([
    PARSER_INTENTS.CREATE_USER,
    PARSER_INTENTS.DEPOSIT,
    PARSER_INTENTS.UNKNOWN,
  ]),
  entities: z.object({
    nombre: z.string().trim().min(1).max(120).nullable(),
    monto: z.number().int().nonnegative().nullable(),
  }),
});
