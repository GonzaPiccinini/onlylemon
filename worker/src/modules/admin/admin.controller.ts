import type { Request, Response } from 'express';
import {
  conversionsFilterSchema,
  createCashierSchema,
  createLandingSchema,
  dateRangeSchema,
  leadsFilterSchema,
  replaceCashierLandingsSchema,
  updateAdminAccountSchema,
  updateCashierSchema,
  updateLandingSchema,
} from './admin.types.js';
import {
  createCashierService,
  createLandingService,
  disableCashierService,
  enableCashierService,
  finishCashierWorkSessionService,
  getCashierStatsService,
  getFundsSeriesService,
  getSummaryService,
  listAdminConversionsService,
  listCashierLandingsService,
  listCashiersService,
  listLeadsService,
  listLandingsService,
  replaceCashierLandingsService,
  setLandingStatusService,
  updateAdminAccountService,
  updateCashierService,
  updateLandingService,
} from './admin.service.js';

export const updateAdminAccountHandler = async (req: Request, res: Response) => {
  const parsed = updateAdminAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await updateAdminAccountService(req.authUser!.userId, parsed.data);
    return res.status(200).json(data);
  } catch {
    return res.status(409).json({ error: 'Could not update account' });
  }
};

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

  try {
    const data = await updateCashierService(req.params.cashierId, parsed.data);
    if (!data) {
      return res.status(404).json({ error: 'Cashier not found' });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(409).json({ error: 'Cashier could not be updated' });
  }
};

export const disableCashierHandler = async (req: Request, res: Response) => {
  try {
    await disableCashierService(req.params.cashierId);
    return res.status(204).send();
  } catch {
    return res.status(404).json({ error: 'Cashier not found' });
  }
};

export const enableCashierHandler = async (req: Request, res: Response) => {
  try {
    await enableCashierService(req.params.cashierId);
    return res.status(204).send();
  } catch {
    return res.status(404).json({ error: 'Cashier not found' });
  }
};

export const finishCashierWorkSessionHandler = async (
  req: Request,
  res: Response,
) => {
  const result = await finishCashierWorkSessionService(req.params.cashierId);

  if (result.kind === 'NOT_FOUND') {
    return res.status(404).json({ error: 'Cashier not found' });
  }

  if (result.kind === 'NO_ACTIVE_SESSION') {
    return res.status(409).json({ error: 'There is no active session' });
  }

  return res.status(204).send();
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

export const listLeadsHandler = async (req: Request, res: Response) => {
  const parsed = leadsFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const data = await listLeadsService(parsed.data);
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

export const listAdminConversionsHandler = async (req: Request, res: Response) => {
  const parsed = conversionsFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const { dateFrom, dateTo, phone, code, cashierIds: cashierIdsCsv, amountMin, amountMax, page, pageSize } = parsed.data;

  // Parse comma-separated cashierIds into an array
  const cashierIds = cashierIdsCsv
    ? cashierIdsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const filters = {
    dateFrom: dateFrom ? new Date(`${dateFrom}T03:00:00.000Z`) : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T03:00:00.000Z`) : undefined,
    phone,
    code,
    cashierIds,
    amountMin,
    amountMax,
  };

  const data = await listAdminConversionsService(filters, page, pageSize);
  return res.status(200).json(data);
};
