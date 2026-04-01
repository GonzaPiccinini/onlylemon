import { buildIntentExtractionPrompt } from '../../constants/ai.js';
import { OPENAI_INTENT_MODEL } from '../../constants/ai.js';
import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { messageParseResultSchema } from '../../domain/parser/schema.js';
import {
  PARSER_INTENTS,
  type MessageParseResult,
  type MessageParser,
} from '../../domain/parser/types.js';

type OpenAiResponseOutputItem = {
  type: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
};

type OpenAiResponsePayload = {
  output?: OpenAiResponseOutputItem[];
};

const OPENAI_RESPONSES_PATH = '/v1/responses';

function unknownParseResult(): MessageParseResult {
  return {
    intent: PARSER_INTENTS.UNKNOWN,
    entities: {
      nombre: null,
      monto: null,
    },
  };
}

function extractTextFromResponse(payload: OpenAiResponsePayload) {
  if (!payload.output) {
    return null;
  }

  for (const item of payload.output) {
    if (item.type !== 'message' || !item.content) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem.type === 'output_text' && contentItem.text) {
        return contentItem.text;
      }
    }
  }

  return null;
}

export class GptNanoMessageParser implements MessageParser {
  async parse(message: string): Promise<MessageParseResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.openai.timeoutMs);

    try {
      const response = await fetch(`${config.openai.baseUrl}${OPENAI_RESPONSES_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openai.apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_INTENT_MODEL,
          input: [
            {
              role: 'user',
              content: buildIntentExtractionPrompt(message),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, model: OPENAI_INTENT_MODEL },
          'OpenAI parser request failed',
        );
        return unknownParseResult();
      }

      const payload = (await response.json()) as OpenAiResponsePayload;
      const outputText = extractTextFromResponse(payload);
      if (!outputText) {
        return unknownParseResult();
      }

      const parsedJson = JSON.parse(outputText) as unknown;
      const parsedResult = messageParseResultSchema.safeParse(parsedJson);
      if (!parsedResult.success) {
        logger.warn(
          {
            issues: parsedResult.error.issues,
          },
          'OpenAI parser returned invalid schema',
        );
        return unknownParseResult();
      }

      return parsedResult.data;
    } catch (error) {
      logger.warn({ err: error }, 'OpenAI parser request failed with exception');
      return unknownParseResult();
    } finally {
      clearTimeout(timeout);
    }
  }
}
