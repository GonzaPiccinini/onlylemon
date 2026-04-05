type NodeErrorContext = {
  node: string;
  session?: string;
  chatId?: string;
  messageId?: string;
  intent?: string;
};

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'UnknownError',
      message: error,
    };
  }

  return {
    name: 'UnknownError',
    message: JSON.stringify(error),
  };
}

export function logNodeError(context: NodeErrorContext, error: unknown) {
  const serializedError = serializeError(error);

  console.error(`[langGraph:${context.node}] node execution failed`, {
    ...context,
    error: serializedError,
  });
}
