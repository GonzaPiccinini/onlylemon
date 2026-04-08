import type { Request, Response } from 'express';
import {
  createCashierSchema,
  dateRangeSchema,
  updateCashierSchema,
} from './admin.types.js';
import {
  createCashierService,
  disableCashierService,
  getCashierStatsService,
  getFundsSeriesService,
  getSummaryService,
  listCashiersService,
  updateCashierService,
} from './admin.service.js';

export const listCashiersHandler = async (_req: Request, res: Response) => {
  const data = await listCashiersService();
  return res.status(200).json(data);
};

export const createCashierHandler = async (req: Request, res: Response) => {
  const parsed = createCashierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await createCashierService(parsed.data);
    return res.status(201).json(data);
  } catch {
    return res.status(409).json({ error: 'Cashier could not be created' });
  }
};

export const updateCashierHandler = async (req: Request, res: Response) => {
  const parsed = updateCashierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const data = await updateCashierService(req.params.cashierId, parsed.data);
  if (!data) {
    return res.status(404).json({ error: 'Cashier not found' });
  }

  return res.status(200).json(data);
};

export const disableCashierHandler = async (req: Request, res: Response) => {
  try {
    await disableCashierService(req.params.cashierId);
    return res.status(204).send();
  } catch {
    return res.status(404).json({ error: 'Cashier not found' });
  }
};

export const summaryHandler = async (req: Request, res: Response) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const data = await getSummaryService(parsed.data);
  return res.status(200).json(data);
};

export const cashierStatsHandler = async (req: Request, res: Response) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const data = await getCashierStatsService(parsed.data);
  return res.status(200).json(data);
};

export const fundsSeriesHandler = async (req: Request, res: Response) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const data = await getFundsSeriesService(parsed.data);
  return res.status(200).json(data);
};
