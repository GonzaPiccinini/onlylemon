type ToolName = 'create_user' | 'deposit_money';

type ChatContextMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
};

export type RuleResolution = {
  toolName: ToolName | null;
  args: Record<string, unknown>;
  fallbackMessage?: string;
};

const RULE_FALLBACK_MESSAGE =
  'Sólo puedo ayudarte a crear un usuario o cargar saldo para un usuario';

function normalizeText(text: string) {
  return text.toLowerCase();
}

function extractName(text: string) {
  const patterns = [
    /(?:nombre\s*(?:es|=|:)\s*)([a-zA-Z][a-zA-Z\s'.-]{1,118})/i,
    /(?:usuario\s*(?:es|=|:)\s*)([a-zA-Z][a-zA-Z\s'.-]{1,118})/i,
    /(?:crear\s+usuario\s+)([a-zA-Z][a-zA-Z\s'.-]{1,118})/i,
    /(?:cuenta\s+)([a-zA-Z][a-zA-Z\s'.-]{1,118})/i,
    /(?:para\s+)([a-zA-Z][a-zA-Z\s'.-]{1,118})(?:\s*$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function extractAmount(text: string) {
  const amountMatch = text.match(/(?:\$\s*)?(\d[\d.,]*)/);
  const raw = amountMatch?.[1];
  if (!raw) {
    return null;
  }

  const sanitized = raw.replace(/[.,]/g, '');
  const parsed = Number.parseInt(sanitized, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function hasCreateIntent(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes('crear una cuenta') ||
    normalized.includes('crear cuenta') ||
    normalized.includes('crear un usuario') ||
    normalized.includes('crear usuario') ||
    normalized.includes('registrar un usuario') ||
    normalized.includes('registrar usuario')
  );
}

function hasDepositIntent(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes('depositar') ||
    normalized.includes('cargar') ||
    normalized.includes('transferir')
  );
}

function getLatestUserMessages(
  history: ChatContextMessage[],
  currentMessageBody: string,
) {
  const sorted = [...history]
    .filter((message) => !message.fromMe && Boolean(message.body?.trim()))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((message) => message.body);

  return [currentMessageBody, ...sorted];
}

export function resolveRule(
  history: ChatContextMessage[],
  currentMessageBody: string,
): RuleResolution {
  const latestUserMessages = getLatestUserMessages(history, currentMessageBody);
  const firstIntentSource = latestUserMessages.find(
    (message) => hasCreateIntent(message) || hasDepositIntent(message),
  );

  if (!firstIntentSource) {
    return {
      toolName: null,
      args: {},
      fallbackMessage: RULE_FALLBACK_MESSAGE,
    };
  }

  const isDepositIntent = hasDepositIntent(firstIntentSource);
  const isCreateIntent = hasCreateIntent(firstIntentSource);

  if (isDepositIntent) {
    let amount: number | null = null;

    for (const message of latestUserMessages) {
      if (!amount) {
        amount = extractAmount(message);
      }
      if (amount) {
        break;
      }
    }

    if (!amount) {
      return {
        toolName: null,
        args: {},
        fallbackMessage: 'To process a deposit, please provide an amount (minimum 2000).',
      };
    }

    return {
      toolName: 'deposit_money',
      args: { amount },
    };
  }

  if (isCreateIntent) {
    let name: string | null = null;
    for (const message of latestUserMessages) {
      name = extractName(message);
      if (name) {
        break;
      }
    }

    if (!name) {
      return {
        toolName: null,
        args: {},
        fallbackMessage: 'To create a user, please provide the name.',
      };
    }

    return {
      toolName: 'create_user',
      args: { name },
    };
  }

  return {
    toolName: null,
    args: {},
    fallbackMessage: RULE_FALLBACK_MESSAGE,
  };
}
