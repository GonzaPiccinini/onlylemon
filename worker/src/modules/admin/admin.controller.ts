import type { Request, Response } from 'express';
import {
  createCashierSchema,
  createLandingSchema,
  dateRangeSchema,
  replaceCashierLandingsSchema,
  updateCashierSchema,
  updateLandingSchema,
} from './admin.types.js';
import {
  createCashierService,
  createLandingService,
  disableCashierService,
  getCashierStatsService,
  getFundsSeriesService,
  getSummaryService,
  listCashierLandingsService,
  listCashiersService,
  listLandingsService,
  replaceCashierLandingsService,
  setLandingStatusService,
  updateCashierService,
  updateLandingService,
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

export const listLandingsHandler = async (_req: Request, res: Response) => {
  const data = await listLandingsService();
  return res.status(200).json(data);
};

export const createLandingHandler = async (req: Request, res: Response) => {
  const parsed = createLandingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await createLandingService(parsed.data);
    return res.status(201).json(data);
  } catch {
    return res.status(409).json({ error: 'Landing could not be created' });
  }
};

export const updateLandingHandler = async (req: Request, res: Response) => {
  const parsed = updateLandingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await updateLandingService(req.params.landingId, parsed.data);
    return res.status(200).json(data);
  } catch {
    return res.status(404).json({ error: 'Landing not found' });
  }
};

export const disableLandingHandler = async (req: Request, res: Response) => {
  try {
    const data = await setLandingStatusService(req.params.landingId, 'DISABLED');
    return res.status(200).json(data);
  } catch {
    return res.status(404).json({ error: 'Landing not found' });
  }
};

export const enableLandingHandler = async (req: Request, res: Response) => {
  try {
    const data = await setLandingStatusService(req.params.landingId, 'ACTIVE');
    return res.status(200).json(data);
  } catch {
    return res.status(404).json({ error: 'Landing not found' });
  }
};

export const listCashierLandingsHandler = async (req: Request, res: Response) => {
  try {
    const data = await listCashierLandingsService(req.params.cashierId);
    return res.status(200).json(data);
  } catch {
    return res.status(404).json({ error: 'Cashier not found' });
  }
};

export const replaceCashierLandingsHandler = async (
  req: Request,
  res: Response,
) => {
  const parsed = replaceCashierLandingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await replaceCashierLandingsService(
      req.params.cashierId,
      parsed.data.landingIds,
    );
    return res.status(200).json(data);
  } catch (error) {
    return res.status(409).json({
      error: error instanceof Error ? error.message : 'Could not replace landings',
    });
  }
};
