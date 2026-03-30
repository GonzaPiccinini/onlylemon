import { FunctionCallingConfigMode } from '@google/genai';
import { GoogleGenAI } from '@google/genai';

import { config } from '../../core/config.js';
import {
  allowedToolNames,
  toolDeclarations,
} from '../../domain/tooling/declarations.js';

let aiModelInstance: GoogleGenAI | null = null;

function getAiModelInstance() {
  if (!aiModelInstance) {
    aiModelInstance = new GoogleGenAI({ apiKey: config.ai.apiKey });
  }
  return aiModelInstance;
}

export async function generateAiResponse(prompt: string) {
  const ai = getAiModelInstance();

  return ai.models.generateContent({
    model: config.ai.model,
    contents: prompt,
    config: {
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.VALIDATED,
          allowedFunctionNames: allowedToolNames,
        },
      },
    },
  });
}
