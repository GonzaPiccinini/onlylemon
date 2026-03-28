import { Router } from 'express';
import { z } from 'zod';

import { generateText } from '../services/ai.js';

const bodySchema = z.object({
  prompt: z.string().min(1).max(4000),
});

export const aiRouter = Router();

aiRouter.post('/generate', async (req, res, next) => {
  try {
    const { prompt } = bodySchema.parse(req.body);
    const text = await generateText(prompt);
    res.status(200).json({ text });
  } catch (error) {
    next(error);
  }
});
