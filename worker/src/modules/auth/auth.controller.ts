import type { Request, Response } from 'express';
import { loginSchema, setupSchema } from './auth.types.js';
import { getMe, getSetupStatus, login, runSetup, SetupConflictError } from './auth.service.js';

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

// ---------------------------------------------------------------------------
// Setup flow handlers (public — no requireAuth)
// ---------------------------------------------------------------------------

export const setupStatusHandler = async (_req: Request, res: Response) => {
  const data = await getSetupStatus();
  return res.status(200).json(data);
};

export const setupHandler = async (req: Request, res: Response) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const result = await runSetup(parsed.data);
    return res.status(201).json(result);
  } catch (e) {
    if (e instanceof SetupConflictError) {
      return res.status(409).json({ error: 'Setup already completed' });
    }
    // Prisma unique constraint violation (username collision)
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'Username already in use' });
    }
    throw e;
  }
};
