import { END, START, StateGraph } from '@langchain/langgraph';
import {
  classifyMessage,
  contactSupport,
  createUser,
  loadBalance,
  unknownNode,
} from './nodes.js';
import { ChatState } from './states.js';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { config } from '../config.js';

// tabla para almacenar los estados de los chats, que se buscan con el chatId
const checkpointer = PostgresSaver.fromConnString(config.DATABASE_URL);
await checkpointer.setup();

const ChatGraph = new StateGraph(ChatState)
  // Nodes
  .addNode('classify_message', classifyMessage, {
    ends: ['contact_support', 'create_user', 'load_balance', 'unknown'],
  })
  .addNode('contact_support', contactSupport)
  .addNode('create_user', createUser)
  .addNode('load_balance', loadBalance)
  .addNode('unknown', unknownNode)

  // Edges
  .addEdge(START, 'classify_message')
  .addEdge('unknown', END)
  .addEdge('contact_support', END)
  .addEdge('create_user', END)
  .addEdge('load_balance', END);

export const chatGraph = ChatGraph.compile({ checkpointer });

const CreateUserGraph = new StateGraph(ChatState);

export const createUserGraph = CreateUserGraph.compile({ checkpointer });

const LoadBalanceGraph = new StateGraph(ChatState);

export const loadBalanceGraph = LoadBalanceGraph.compile({ checkpointer });
