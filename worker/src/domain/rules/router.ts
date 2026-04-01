import {
  FALLBACK_CREATE_NAME_REQUIRED_MESSAGE,
  FALLBACK_DEPOSIT_AMOUNT_REQUIRED_MESSAGE,
  FALLBACK_GENERAL_MESSAGE,
} from '../../constants/messages.js';
import { PARSER_INTENTS, type MessageParseResult } from '../parser/types.js';

type ToolName = 'create_user' | 'deposit_money';

export type RuleResolution = {
  toolName: ToolName | null;
  args: Record<string, unknown>;
  fallbackMessage?: string;
};

export function resolveRule(parsedMessage: MessageParseResult): RuleResolution {
  if (parsedMessage.intent === PARSER_INTENTS.CREATE_USER) {
    if (!parsedMessage.entities.nombre) {
      return {
        toolName: null,
        args: {},
        fallbackMessage: FALLBACK_CREATE_NAME_REQUIRED_MESSAGE,
      };
    }

    return {
      toolName: 'create_user',
      args: {
        name: parsedMessage.entities.nombre,
      },
    };
  }

  if (parsedMessage.intent === PARSER_INTENTS.DEPOSIT) {
    if (parsedMessage.entities.monto === null) {
      return {
        toolName: null,
        args: {},
        fallbackMessage: FALLBACK_DEPOSIT_AMOUNT_REQUIRED_MESSAGE,
      };
    }

    return {
      toolName: 'deposit_money',
      args: {
        amount: parsedMessage.entities.monto,
      },
    };
  }

  return {
    toolName: null,
    args: {},
    fallbackMessage: FALLBACK_GENERAL_MESSAGE,
  };
}
