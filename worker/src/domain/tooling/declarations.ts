import type { FunctionDeclaration } from '@google/genai';

export type ToolName = 'create_user' | 'deposit_money';

export const allowedToolNames: ToolName[] = ['create_user', 'deposit_money'];

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'create_user',
    description: 'Create a user with name in the Lemon Platform',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'deposit_money',
    description: 'Deposit money for a user with name in the external API.',
    parametersJsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        amount: { type: 'integer', minimum: 2000 },
      },
      required: ['name', 'amount'],
    },
  },
];
