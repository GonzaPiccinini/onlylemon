import { Command, END, GraphNode } from '@langchain/langgraph';
import { ChatState, MessageClassificationSchema } from './states.js';
import { openaiClient, systemInstruction } from '../openai.js';
import { config } from '../config.js';
import { executeResponseContactSupport, executeResponseFlow } from '../waha.js';

export const classifyMessage: GraphNode<typeof ChatState> = async (
  state,
  graphConfig,
) => {
  try {
    const userMessage = state.job.payload.body;

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
    // IMPLEMENTAR MANEJO DE ERROR
    console.error(`Error executing classifyMessage node: ${error}`);
    return new Command({
      update: {},
      goto: END,
    });
  }
};

export const contactSupport: GraphNode<typeof ChatState> = async (
  state,
  config,
) => {
  try {
    const { session, payload } = state.job;

    const contactSupportMessage = `Podés contactar al equipo de soporte a través del siguiente link:`;
    await executeResponseFlow(
      session,
      payload.from,
      payload.id,
      contactSupportMessage,
    );
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

    return new Command({
      update: {},
      goto: END,
    });
  } catch (error) {
    // IMPLEMENTAR MANEJO DE ERROR
    console.error(`Error executing contactSupport node : ${error}`);
    return new Command({
      update: {},
      goto: END,
    });
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

export const unknownNode: GraphNode<typeof ChatState> = async (
  state,
  config,
) => {
  const unknownMessage = `Lo siento, no pude entender tu solicitud. Por favor, intentá reformular tu mensaje o escribí "ayuda" para obtener asistencia.`;

  try {
    await executeResponseFlow(
      state.job.session,
      state.job.payload.from,
      state.job.payload.id,
      unknownMessage,
    );
  } catch (error) {
    console.error(`Error executing unknown node: ${error}`);
  }

  return new Command({ update: {}, goto: END });
};
