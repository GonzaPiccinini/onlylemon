import { Command, END, GraphNode } from '@langchain/langgraph';
import { ChatState, MessageClassificationSchema } from './states.js';
import { openaiClient } from '../../ai/openai/client.js';
import { systemInstruction } from '../../ai/openai/instructions.js';
import { config } from '../../config/env.js';
import {
  executeResponseContactSupport,
  executeResponseFlow,
} from '../../integrations/waha/flows.js';
import { logNodeError } from './errorHandling.js';
import { saveWorkerMessage } from '../../persistence/repositories/messageRepository.js';

export const classifyMessage: GraphNode<typeof ChatState> = async (
  state,
  graphConfig,
) => {
  const errorContext = {
    node: 'classify_message',
    session: state.job.session,
    chatId: state.job.payload.from,
    messageId: state.job.payload.id,
    intent: state.intent,
  };

  try {
    const userMessage = state.job.payload.body as string;

    const response = await openaiClient.responses.create(
      {
        model: config.OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content: systemInstruction,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      },

      {
        timeout: config.OPENAI_TIMEOUT_MS,
        maxRetries: 3,
      },
    );
    const parsedResponse = MessageClassificationSchema.safeParse(
      JSON.parse(response.output_text),
    );
    if (parsedResponse.error) throw new Error(parsedResponse.error.message);

    const { intent: nextNode, entity } = parsedResponse.data;

    return new Command({
      update: { intent: nextNode, entity },
      goto: nextNode,
    });
  } catch (error) {
    logNodeError(errorContext, error);
    return new Command({
      update: {
        intent: 'unknown',
        entity: {
          name: null,
          amount: null,
        },
      },
      goto: 'unknown',
    });
  }
};

export const contactSupport: GraphNode<typeof ChatState> = async (
  state,
  graphConfig,
) => {
  const errorContext = {
    node: 'contact_support',
    session: state.job.session,
    chatId: state.job.payload.from,
    messageId: state.job.payload.id,
    intent: state.intent,
  };

  try {
    const { session, payload } = state.job;

    const contactSupportMessage = `Podés contactar al equipo de soporte a través del siguiente link:`;
    await executeResponseFlow(
      session,
      payload.from,
      payload.id,
      contactSupportMessage,
    );
    await saveWorkerMessage({
      session,
      chatId: payload.from,
      body: contactSupportMessage,
    });

    await executeResponseContactSupport(
      session,
      payload.from,
      payload.id,
      'https://wa.me/5493516835986',
      {
        title: '🍋 Soporte Lemonbet',
        description:
          '¿Necesitás ayuda? Contactá al equipo de soporte y resolvé tus dudas de forma rápida y sencilla',
        url: 'https://wa.me/5493516835986',
        image: {
          url: 'https://i.imgur.com/Ss9eSmZ.png',
        },
      },
    );
    await saveWorkerMessage({
      session,
      chatId: payload.from,
      body: 'https://wa.me/5493516835986',
    });

    return new Command({
      update: {},
      goto: END,
    });
  } catch (error) {
    logNodeError(errorContext, error);

    try {
      const { session, payload } = state.job;
      const fallbackMessage =
        'Podés contactar al equipo de soporte a través del siguiente link: https://wa.me/5493516835986';

      await executeResponseFlow(
        session,
        payload.from,
        payload.id,
        fallbackMessage,
      );
      await saveWorkerMessage({
        session,
        chatId: payload.from,
        body: fallbackMessage,
      });
    } catch (fallbackError) {
      logNodeError(
        {
          ...errorContext,
          node: 'contact_support_fallback',
        },
        fallbackError,
      );
    }

    return new Command({ update: {}, goto: END });
  }
};

export const createUser: GraphNode<typeof ChatState> = async (
  state,
  config,
) => {
  return new Command({ update: {}, goto: END });
};

export const loadBalance: GraphNode<typeof ChatState> = async (
  state,
  config,
) => {
  return new Command({ update: {}, goto: END });
};

export const unknownNode: GraphNode<typeof ChatState> = async (state) => {
  const unknownMessage =
    'Lo siento, no pude entender tu solicitud. Por favor, intentá reformular tu mensaje o contactá al soporte para recibir asistencia.';
  const errorContext = {
    node: 'unknown',
    session: state.job.session,
    chatId: state.job.payload.from,
    messageId: state.job.payload.id,
    intent: state.intent,
  };

  try {
    await executeResponseFlow(
      state.job.session,
      state.job.payload.from,
      state.job.payload.id,
      unknownMessage,
    );
    await saveWorkerMessage({
      session: state.job.session,
      chatId: state.job.payload.from,
      body: unknownMessage,
    });
  } catch (error) {
    logNodeError(errorContext, error);

    try {
      await executeResponseFlow(
        state.job.session,
        state.job.payload.from,
        state.job.payload.id,
        'Tuvimos un problema temporal procesando tu mensaje. Intentá nuevamente en unos minutos. Si el problema persiste, contactá al soporte a través del siguiente link: https://wa.me/5493516835986',
      );
      await saveWorkerMessage({
        session: state.job.session,
        chatId: state.job.payload.from,
        body: 'Tuvimos un problema temporal procesando tu mensaje. Intentá nuevamente en unos minutos. Si el problema persiste, contactá al soporte a través del siguiente link: https://wa.me/5493516835986',
      });
    } catch (fallbackError) {
      logNodeError(
        {
          ...errorContext,
          node: 'unknown_fallback',
        },
        fallbackError,
      );
    }
  }

  return new Command({ update: {}, goto: END });
};
