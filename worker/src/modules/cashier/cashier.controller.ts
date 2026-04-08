import type { Request, Response } from 'express';
import { addFundsSchema } from './cashier.types.js';
import {
  createAddFundsService,
  finishSessionService,
  getCurrentSessionService,
  listAddFundsHistoryService,
  listClientPhonesService,
  listSessionsService,
  startSessionService,
} from './cashier.service.js';

const getCashierId = (req: Request): string | null => req.authUser?.cashierId ?? null;

export const listSessionsHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await listSessionsService(cashierId);
  return res.status(200).json(data);
};

export const currentSessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await getCurrentSessionService(cashierId);
  return res.status(200).json(data);
};

export const startSessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await startSessionService(cashierId);
  if (!data) {
    return res.status(409).json({ error: 'There is already an active session' });
  }

  return res.status(201).json(data);
};

export const finishSessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await finishSessionService(cashierId);
  if (!data) {
    return res.status(409).json({ error: 'There is no active session' });
  }

  return res.status(200).json(data);
};

export const clientPhonesHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await listClientPhonesService(cashierId);
  return res.status(200).json(data);
};

export const addFundsHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const parsed = addFundsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const data = await createAddFundsService(cashierId, parsed.data);
  if (!data) {
    return res.status(409).json({ error: 'Cannot register funds without active session' });
  }

  return res.status(201).json(data);
};

export const addFundsHistoryHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await listAddFundsHistoryService(cashierId);
  return res.status(200).json(data);
};
