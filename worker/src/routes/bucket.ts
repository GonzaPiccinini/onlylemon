import { Router } from 'express';
import { z } from 'zod';

import { createUploadUrl } from '../services/bucket.js';

const bodySchema = z.object({
  key: z.string().min(1).max(512),
  contentType: z.string().min(1).max(255),
});

export const bucketRouter = Router();

bucketRouter.post('/upload-url', async (req, res, next) => {
  try {
    const payload = bodySchema.parse(req.body);
    const result = await createUploadUrl(payload.key, payload.contentType);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
