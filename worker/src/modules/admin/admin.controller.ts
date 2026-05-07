import type { Request, Response } from 'express';
import {
  conversionsFilterSchema,
  createAdminSchema,
  createCashierSchema,
  createLandingSchema,
  dateRangeSchema,
  leadHistoryQuerySchema,
  leadsFilterSchema,
  replaceCashierLandingsSchema,
  setAdminStatusSchema,
  updateAdminAccountSchema,
  updateAdminSchema,
  updateCashierSchema,
  updateLandingSchema,
} from './admin.types.js';
import { addOneDayIsoDate } from '../../utils/timezone.js';
import {
  AdminNotFoundError,
  createAdminService,
  createCashierService,
  createLandingService,
  disableCashierService,
  enableCashierService,
  finishCashierWorkSessionService,
  getCashierStatsService,
  getFundsSeriesService,
  getLeadHistoryService,
  getSummaryService,
  listAdminConversionsService,
  listAdminsService,
  listCashierLandingsService,
  listCashiersService,
  listLeadsService,
  listLandingsService,
  replaceCashierLandingsService,
  setAdminStatusService,
  setLandingStatusService,
  SelfDisableError,
  updateAdminAccountService,
  updateAdminService,
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

export const getLeadHistoryHandler = async (req: Request, res: Response) => {
  const leadId = req.params.id;
  if (!leadId) {
    return res.status(400).json({ error: 'Missing lead id' });
  }
  const parsed = leadHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }
  const { page, pageSize, dateFrom, dateTo } = parsed.data;
  const data = await getLeadHistoryService(leadId, {
    page,
    pageSize,
    dateFrom: dateFrom ? new Date(`${dateFrom}T03:00:00.000Z`) : undefined,
    // dateTo is made inclusive by shifting to the start of the next day before
    // passing to the repo, which uses `lt`. So dateTo='2026-05-07' becomes
    // lt 2026-05-08T03:00:00Z (Argentina midnight of May 8), including all of May 7.
    dateTo: dateTo ? new Date(`${addOneDayIsoDate(dateTo)}T03:00:00.000Z`) : undefined,
  });
  if (!data) {
    return res.status(404).json({ error: 'Lead not found' });
  }
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

// ---------------------------------------------------------------------------
// Admin CRUD handlers (task 23)
// All gated by requireAuth + requireRole('SUPER_ADMIN') in admin.routes.ts
// ---------------------------------------------------------------------------

export const listAdminsHandler = async (_req: Request, res: Response) => {
  const data = await listAdminsService();
  return res.status(200).json(data);
};

export const createAdminHandler = async (req: Request, res: Response) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await createAdminService(parsed.data);
    return res.status(201).json(data);
  } catch (e) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'Username already in use' });
    }
    return res.status(500).json({ error: 'Could not create admin' });
  }
};

export const updateAdminHandler = async (req: Request, res: Response) => {
  const parsed = updateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await updateAdminService(req.params.adminId, parsed.data);
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof AdminNotFoundError) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'Username already in use' });
    }
    return res.status(500).json({ error: 'Could not update admin' });
  }
};

export const setAdminStatusHandler = async (req: Request, res: Response) => {
  const parsed = setAdminStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await setAdminStatusService(
      req.authUser!.userId,
      req.params.adminId,
      parsed.data.status,
    );
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof AdminNotFoundError) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    if (e instanceof SelfDisableError) {
      return res.status(403).json({ error: 'self_disable_not_allowed' });
    }
    return res.status(500).json({ error: 'Could not change admin status' });
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
