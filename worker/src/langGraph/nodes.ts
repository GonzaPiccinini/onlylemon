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

    let currentState;
    if (nextNode === 'unknown') currentState = 'startUnknownState';
    if (nextNode === 'contact_support') currentState = 'startContactSupport';
    if (nextNode === 'create_user') currentState = 'startCreateUser';
    if (nextNode === 'load_balance') currentState = 'startLoadBalance';

    return new Command({
      update: { intent: nextNode, entity, currentState },
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

    const contactSupportMessage = `Podés contactar al equipo de soporte por WhatsApp a través del siguiente contacto:`;
    await executeResponseFlow(
      session,
      payload.from,
      payload.id,
      contactSupportMessage,
    );
    await executeResponseContactSupport(session, payload.from, payload.id, [
      {
        fullname: 'Soporte Lemon 🍋',
        organization: 'lemonbet.top',
        phoneNumber: '+54 9 3516 83-5986',
        whatsappId: '47408553701472@lid',
        vcard: null,
      },
    ]);

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
