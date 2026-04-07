import { Job } from 'bullmq';
import { chatGraph } from '../../state/langgraph/graphs.js';
import { JobSchema } from '../../state/langgraph/states.js';
import {
  getChat,
  saveChat,
  saveInboundMessage,
} from '../../persistence/repositories/messageRepository.js';
import { exectuteSendListFlow } from '../../integrations/waha/flows.js';
import { mapLeadsToPhone } from '../../integrations/leads/client.js';

export async function processInboundJob(job: Job) {
  try {
    // validar idempotencia del job

    // parsear data del job
    const parsedData = JobSchema.safeParse(job.data);
    if (parsedData.error) {
      console.error(`Error parsing job data: ${parsedData.error.message}`);
      return;
    }
    const data = parsedData.data;

    // validar si es el primer mensaje del chat
    const chat = await getChat(data.session, data.payload.from);
    if (!chat) {
      // verificar si existe codigo de leads en el mensaje
      await mapLeadsToPhone(
        data.session,
        data.payload.from,
        data.payload.body ? data.payload.body : '',
      );

      // enviar mensaje de bienvenida
      await exectuteSendListFlow(data.session, data.payload.from, {
        title: '¡Bienvenido a Lemonbet 🍋!',
        description: '¿En qué te puedo ayudar?',
        button: 'Abrir menú de opciones',
        sections: [
          {
            title: '¿Qué querés hacer? (Elegí una opción)',
            rows: [
              {
                title: 'Crear un usuario',
                rowId: 'create_user',
              },
              {
                title: 'Cargar saldo (fichas)',
                rowId: 'add_funds',
              },
              {
                title: 'Contactar a soporte',
                rowId: 'contact_support',
              },
              {
                title: 'Recordar mi usuario y contraseña',
                rowId: 'remember_user',
              },
              {
                title: 'Saber el link de la página',
                rowId: 'get_link',
              },
            ],
          },
        ],
      });

      // guardar chat en db
      await saveChat(data.session, data.payload.from);

      return;
    }

    await saveInboundMessage(data);

    // // invocar (reanudar) grafo del chat
    // await chatGraph.invoke(
    //   {
    //     intent: 'unknown',
    //     entity: {
    //       name: null,
    //       amount: null,
    //     },
    //     job: data,
    //   },
    //   {
    //     configurable: {
    //       thread_id: data.payload.from, // el thread_id == chatId, de esa forma identificamos el hilo de cada chat
    //     },
    //   },
    // );
  } catch (error) {
    console.error(`Error processing inbound job ${job.id}: ${error}`);
    throw error;
  }
}
