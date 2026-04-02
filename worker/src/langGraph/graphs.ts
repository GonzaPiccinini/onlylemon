import { END, START, StateGraph } from '@langchain/langgraph';
import { classifyMessage, contactSupport } from './nodes.js';
import { ChatState } from './states.js';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { config } from '../config.js';

// tabla para almacenar los estados de los chats, que se buscan con el chatId
const checkpointer = PostgresSaver.fromConnString(config.DATABASE_URL);
await checkpointer.setup();

const ChatGraph = new StateGraph(ChatState)
  .addNode('classifyMessage', classifyMessage, {
    ends: ['contact_support', END],
  })
  .addNode('contact_support', contactSupport)
  .addEdge('contact_support', END)
  .addEdge(START, 'classifyMessage');

export const chatGraph = ChatGraph.compile({ checkpointer });
