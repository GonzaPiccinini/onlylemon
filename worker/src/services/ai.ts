import { GoogleGenAI } from '@google/genai';

import { config } from '../config/env.js';

const ai = new GoogleGenAI({
  apiKey: config.ai.apiKey,
});

export async function generateText(prompt: string) {
  const response = await ai.models.generateContent({
    model: config.ai.model,
    contents: {
      text: prompt,
    },
  });
  return response.text;
}
