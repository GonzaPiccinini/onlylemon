import type { Request, Response } from 'express';
import { loginSchema } from './auth.types.js';
import { getMe, login } from './auth.service.js';

export const loginHandler = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid login payload',
      details: parsed.error.flatten(),
    });
  }

  const result = await login(parsed.data);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.status(200).json(result);
};

export const meHandler = async (req: Request, res: Response) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await getMe(req.authUser);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json(user);
};

export const logoutHandler = (_req: Request, res: Response) =>
  res.status(204).send();
