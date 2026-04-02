import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { config } from './config.js';

const checkPointer = PostgresSaver.fromConnString(config.DATABASE_URL);

// 1. Definir la estructura del Estado
const CreatingUserState = Annotation.Root({
  intent: Annotation<string>(), // ej: "create_user", "cancel", "provide_name"
  currentState: Annotation<string>(), // "WaitingName", "UserCreated", "Canceled"
  userName: Annotation<string>(),
  // Aquí puedes agregar más entidades extraídas por la IA
});

// 2. Nodos: Funciones que ejecutan la lógica de cada estado

// Simula el extractor de IA (en la realidad, aquí llamas a tu LLM)
const intentExtractorNode = async (state: typeof CreatingUserState.State) => {
  // Lógica para analizar el mensaje del usuario con IA.
  // Retornamos el estado actualizado.
  return {
    intent: state.intent || 'provide_name', // Simulado
    userName: state.userName || 'Carlos', // Simulado
  };
};

const waitingNameNode = async (state: typeof CreatingUserState.State) => {
  console.log(
    "Bot: Por favor, dime tu nombre para registrarte. (O escribe 'cancelar')",
  );

  if (state.intent === 'cancel') {
    return { currentState: 'Canceled' };
  }

  if (state.intent === 'provide_name' && state.userName) {
    // Aquí interactuarías con tu base de datos o API para crear el usuario
    return { currentState: 'UserCreated' };
  }

  return { currentState: 'WaitingName' };
};

const canceledNode = async (state: typeof CreatingUserState.State) => {
  console.log('Bot: La creación de usuario ha sido cancelada.');
  return { currentState: 'Canceled' };
};

const userCreatedNode = async (state: typeof CreatingUserState.State) => {
  console.log(`Bot: ¡Éxito! El usuario ${state.userName} ha sido creado.`);
  return { currentState: 'UserCreated' };
};

// 3. Aristas Condicionales: Funciones de ruteo
const routeFromWaitingName = (state: typeof CreatingUserState.State) => {
  if (state.currentState === 'Canceled') return 'canceled_node';
  if (state.currentState === 'UserCreated') return 'user_created_node';

  // Si no se canceló ni se creó, vuelve a pedir el nombre (o maneja el error)
  return 'waiting_name_node';
};

// 4. Construir el Grafo
const builder = new StateGraph(CreatingUserState)
  .addNode('intent_extractor', intentExtractorNode)
  .addNode('waiting_name_node', waitingNameNode)
  .addNode('canceled_node', canceledNode)
  .addNode('user_created_node', userCreatedNode)

  // Definir el flujo
  .addEdge(START, 'intent_extractor')
  .addEdge('intent_extractor', 'waiting_name_node')
  .addConditionalEdges('waiting_name_node', routeFromWaitingName)
  .addEdge('canceled_node', END)
  .addEdge('user_created_node', END);

// Compilar la aplicación
const app = builder.compile();

// Ejemplo de ejecución
async function runBot() {
  const initialState = {
    intent: 'provide_name',
    userName: 'Carlos',
    currentState: 'WaitingName',
  };

  const finalState = await app.invoke(initialState);
  console.log('Estado final del grafo:', finalState);
}

runBot();
