import type { Request, Response } from 'express';
import {
  conversionsFilterSchema,
  conversionsTotalsFilterSchema,
  createAdminSchema,
  createCashierSchema,
  createLandingFallbackPhoneSchema,
  createLandingSchema,
  createMetaPixelSchema,
  dateRangeSchema,
  leadHistoryQuerySchema,
  leadsFilterSchema,
  replaceSessionLandingsSchema,
  setAdminStatusSchema,
  updateAdminAccountSchema,
  updateAdminSchema,
  updateCashierMaxSessionsSchema,
  updateCashierSchema,
  updateLandingFallbackPhoneSchema,
  updateLandingSchema,
  updateMetaPixelSchema,
} from './admin.types.js';
import { addOneDayIsoDate } from '../../utils/timezone.js';
import {
  AdminNotFoundError,
  createAdminService,
  createCashierService,
  createLandingFallbackPhoneService,
  createLandingServiceWithFallbacks,
  createMetaPixelService,
  deleteLandingFallbackPhoneService,
  deleteMetaPixelService,
  disableCashierService,
  enableCashierService,
  finishCashierWorkSessionService,
  getAdminConversionsTotalsService,
  getCashierStatsService,
  getFundsSeriesService,
  getLeadHistoryService,
  getMetaPixelByIdService,
  getSummaryService,
  InvalidPhoneFormatError,
  LastFallbackError,
  listAdminConversionsService,
  listAdminsService,
  listCashierSessionsService,
  listCashiersService,
  listLandingFallbackPhonesService,
  listLeadsService,
  listLandingsService,
  listMetaPixelsService,
  MetaPixelNotFoundError,
  MetaPixelRestrictError,
  PixelIdFrozenError,
  setAdminStatusService,
  setLandingStatusService,
  SelfDisableError,
  updateAdminAccountService,
  updateAdminService,
  updateCashierService,
  updateLandingFallbackPhoneService,
  updateLandingServiceWithFallbacks,
  updateMetaPixelService,
  WhatsappMessagesTooManyError,
  WhatsappMessageTooLongError,
  createCashierSessionService,
  deleteCashierSessionService,
  getSessionLandingsService,
  replaceSessionLandingsService,
  getLandingSessionsService,
  updateCashierMaxSessionsService,
  startWhatsappLinkForSessionAdminService,
  SessionCapReachedError,
  SessionNotFoundError,
  MaxSessionsBelowCurrentError,
} from './admin.service.js';
import { startWhatsappLinkSchema } from '../cashier/cashier.types.js';

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

  const { dateFrom, dateTo, ...rest } = parsed.data;
  const data = await listLeadsService({
    ...rest,
    // Mirror the history endpoint convention: dateFrom is the start of the local day (03:00 UTC),
    // dateTo is shifted +1 day so the half-open interval [gte, lt) includes the full selected day.
    dateFrom: dateFrom ? new Date(`${dateFrom}T03:00:00.000Z`) : undefined,
    dateTo: dateTo ? new Date(`${addOneDayIsoDate(dateTo)}T03:00:00.000Z`) : undefined,
  });
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
    const data = await createLandingServiceWithFallbacks(parsed.data);
    return res.status(201).json(data);
  } catch (e) {
    if (e instanceof InvalidPhoneFormatError) {
      return res.status(400).json({ error: e.message });
    }
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
    const data = await updateLandingServiceWithFallbacks(req.params.landingId, parsed.data);
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof InvalidPhoneFormatError) {
      return res.status(400).json({ error: e.message });
    }
    if (e instanceof WhatsappMessagesTooManyError || e instanceof WhatsappMessageTooLongError) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(404).json({ error: 'Landing not found' });
  }
};

// ---------------------------------------------------------------------------
// 3.4 — MetaPixel CRUD handlers
// ---------------------------------------------------------------------------

/**
 * GET /admin/meta-pixels
 * Lists all MetaPixel rows. accessToken is NEVER returned.
 */
export const listMetaPixelsHandler = async (_req: Request, res: Response) => {
  const data = await listMetaPixelsService();
  return res.status(200).json(data);
};

/**
 * POST /admin/meta-pixels
 * Creates a new MetaPixel. Unique violation on pixelId → 409.
 * accessToken is NEVER returned in the response.
 */
export const createMetaPixelHandler = async (req: Request, res: Response) => {
  const parsed = createMetaPixelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const data = await createMetaPixelService(parsed.data);
    return res.status(201).json(data);
  } catch (e) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'A MetaPixel with this pixelId already exists' });
    }
    return res.status(500).json({ error: 'Could not create MetaPixel' });
  }
};

/**
 * GET /admin/meta-pixels/:id
 * Fetches a single MetaPixel by id. accessToken NEVER returned.
 */
export const getMetaPixelHandler = async (req: Request, res: Response) => {
  try {
    const data = await getMetaPixelByIdService(req.params.id);
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof MetaPixelNotFoundError) {
      return res.status(404).json({ error: 'MetaPixel not found' });
    }
    throw e;
  }
};

/**
 * PUT /admin/meta-pixels/:id
 * Updates a MetaPixel. Guards:
 *  - pixelId frozen when ≥1 lead references the row → 409 PIXEL_ID_FROZEN
 *  - accessToken and label always editable
 */
export const updateMetaPixelHandler = async (req: Request, res: Response) => {
  const parsed = updateMetaPixelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const data = await updateMetaPixelService(req.params.id, parsed.data);
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof PixelIdFrozenError) {
      return res.status(409).json({ error: 'PIXEL_ID_FROZEN', message: e.message });
    }
    if (e instanceof MetaPixelNotFoundError) {
      return res.status(404).json({ error: 'MetaPixel not found' });
    }
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'A MetaPixel with this pixelId already exists' });
    }
    return res.status(500).json({ error: 'Could not update MetaPixel' });
  }
};

/**
 * DELETE /admin/meta-pixels/:id
 * Deletes a MetaPixel. Blocked if any landing or lead references the row → 409 RESTRICT.
 */
export const deleteMetaPixelHandler = async (req: Request, res: Response) => {
  try {
    await deleteMetaPixelService(req.params.id);
    return res.status(204).send();
  } catch (e) {
    if (e instanceof MetaPixelRestrictError) {
      return res.status(409).json({
        error: 'PIXEL_REFERENCED',
        message: e.message,
        references: e.references,
      });
    }
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2025') {
      return res.status(404).json({ error: 'MetaPixel not found' });
    }
    return res.status(500).json({ error: 'Could not delete MetaPixel' });
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

  const { dateFrom, dateTo, phone, code, adCode, cashierIds: cashierIdsCsv, amountMin, amountMax, page, pageSize } = parsed.data;

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
    adCode,
    cashierIds,
    amountMin,
    amountMax,
  };

  const data = await listAdminConversionsService(filters, page, pageSize);
  return res.status(200).json(data);
};

export const getAdminConversionsTotalsHandler = async (req: Request, res: Response) => {
  const parsed = conversionsTotalsFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten(),
    });
  }

  const { dateFrom, dateTo, phone, code, adCode, cashierIds: cashierIdsCsv, amountMin, amountMax } = parsed.data;

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
    adCode,
    cashierIds,
    amountMin,
    amountMax,
  };

  const data = await getAdminConversionsTotalsService(filters);
  return res.status(200).json(data);
};

// ---------------------------------------------------------------------------
// B6.2 — LandingFallbackPhone CRUD handlers [REQ-3, REQ-4, REQ-5, REQ-6]
// ---------------------------------------------------------------------------

export const listLandingFallbackPhonesHandler = async (req: Request, res: Response) => {
  const { landingId } = req.params;
  const data = await listLandingFallbackPhonesService(landingId);
  return res.status(200).json(data);
};

export const createLandingFallbackPhoneHandler = async (req: Request, res: Response) => {
  const parsed = createLandingFallbackPhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const { landingId } = req.params;

  try {
    const data = await createLandingFallbackPhoneService(landingId, parsed.data);
    return res.status(201).json(data);
  } catch (e) {
    if (e instanceof InvalidPhoneFormatError) {
      return res.status(400).json({ error: e.message });
    }
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'Phone already exists for this landing' });
    }
    if (prismaError?.code === 'P2003' || prismaError?.code === 'P2025') {
      return res.status(404).json({ error: 'Landing not found' });
    }
    return res.status(500).json({ error: 'Could not create fallback phone' });
  }
};

export const updateLandingFallbackPhoneHandler = async (req: Request, res: Response) => {
  const parsed = updateLandingFallbackPhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const { id } = req.params;

  try {
    const data = await updateLandingFallbackPhoneService(id, parsed.data);
    return res.status(200).json(data);
  } catch (e) {
    if (e instanceof InvalidPhoneFormatError) {
      return res.status(400).json({ error: e.message });
    }
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return res.status(409).json({ error: 'Phone already exists for this landing' });
    }
    if (prismaError?.code === 'P2025') {
      return res.status(404).json({ error: 'Fallback phone not found' });
    }
    return res.status(500).json({ error: 'Could not update fallback phone' });
  }
};

/**
 * Injectable variant of deleteLandingFallbackPhoneHandler for unit testing.
 * Accepts a deps object so tests can inject a mock deleteFn without ES module mocking.
 */
export const deleteLandingFallbackPhoneHandlerImpl =
  (deps: { deleteFn: (id: string) => Promise<void> }) =>
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await deps.deleteFn(id);
      return res.status(204).send();
    } catch (e) {
      if (e instanceof LastFallbackError) {
        return res.status(409).json({
          code: 'LAST_FALLBACK',
          message: 'Debes agregar otro respaldo antes de eliminar este',
        });
      }
      const prismaError = e as { code?: string };
      if (prismaError?.code === 'P2025') {
        return res.status(404).json({ error: 'Fallback phone not found' });
      }
      return res.status(500).json({ error: 'Could not delete fallback phone' });
    }
  };

export const deleteLandingFallbackPhoneHandler = deleteLandingFallbackPhoneHandlerImpl({
  deleteFn: deleteLandingFallbackPhoneService,
});

// ---------------------------------------------------------------------------
// E — WhatsappSession admin handlers
// ---------------------------------------------------------------------------

/**
 * E1 — GET /cashiers/:cashierId/sessions
 * Lists all sessions for a cashier with live WAHA status.
 */
export const listCashierSessionsHandler = async (req: Request, res: Response) => {
  const data = await listCashierSessionsService(req.params.cashierId);
  if (data === null) {
    return res.status(404).json({ error: 'Cashier not found' });
  }
  return res.status(200).json(data);
};

/**
 * E2 — POST /cashiers/:cashierId/sessions
 * Creates a new session for a cashier. Returns 409 if at cap.
 */
export const createCashierSessionHandler = async (req: Request, res: Response) => {
  try {
    const data = await createCashierSessionService(req.params.cashierId);
    if (data === null) {
      return res.status(404).json({ error: 'Cashier not found' });
    }
    return res.status(201).json(data);
  } catch (error) {
    if (error instanceof SessionCapReachedError) {
      return res.status(409).json({ error: 'SESSION_CAP_REACHED', message: 'Cashier is at max sessions limit' });
    }
    return res.status(500).json({ error: 'Could not create session' });
  }
};

/**
 * E3 — DELETE /sessions/:sessionId
 * Deletes a session (WAHA best-effort + DB).
 */
export const deleteCashierSessionHandler = async (req: Request, res: Response) => {
  try {
    await deleteCashierSessionService(req.params.sessionId);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.status(500).json({ error: 'Could not delete session' });
  }
};

/**
 * E4a — GET /sessions/:sessionId/landings
 * Lists landings bound to a session.
 */
export const getSessionLandingsHandler = async (req: Request, res: Response) => {
  const data = await getSessionLandingsService(req.params.sessionId);
  if (data === null) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.status(200).json(data);
};

/**
 * E4b — PUT /sessions/:sessionId/landings
 * Full-replace landings for a session.
 */
export const replaceSessionLandingsHandler = async (req: Request, res: Response) => {
  const parsed = replaceSessionLandingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const data = await replaceSessionLandingsService(req.params.sessionId, parsed.data.landingIds);
  if (data === null) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.status(200).json(data);
};

/**
 * E5 (landing side) — GET /landings/:landingId/sessions
 * Lists sessions bound to a landing.
 */
export const getLandingSessionsHandler = async (req: Request, res: Response) => {
  const data = await getLandingSessionsService(req.params.landingId);
  if (data === null) {
    return res.status(404).json({ error: 'Landing not found' });
  }
  return res.status(200).json(data);
};

/**
 * E6 — PATCH /cashiers/:cashierId (maxSessions only)
 * Updates maxSessions for a cashier.
 */
export const updateCashierMaxSessionsHandler = async (req: Request, res: Response) => {
  const parsed = updateCashierMaxSessionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const data = await updateCashierMaxSessionsService(req.params.cashierId, parsed.data.maxSessions);
    if (data === null) {
      return res.status(404).json({ error: 'Cashier not found' });
    }
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof MaxSessionsBelowCurrentError) {
      return res.status(409).json({
        error: 'MAX_SESSIONS_BELOW_CURRENT',
        message: `El cajero tiene ${error.currentCount} sesion${error.currentCount === 1 ? '' : 'es'} creada${error.currentCount === 1 ? '' : 's'}. Eliminá las necesarias antes de bajar el límite.`,
        currentCount: error.currentCount,
      });
    }
    throw error;
  }
};

/**
 * Admin "Generar QR ahora" — POST /admin/whatsapp-sessions/:sessionId/link
 * Initiates WhatsApp QR/pairing flow for any session (no ownership check).
 * Error mapping mirrors the cashier linkMySessionHandler.
 */
export const startWhatsappLinkForSessionAdminHandler = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const parsed = startWhatsappLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await startWhatsappLinkForSessionAdminService(sessionId, parsed.data.phoneNumber);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'WAHA_SESSION_NOT_READY') {
      return res.status(409).json({ error: 'WAHA_SESSION_NOT_READY', message: 'WhatsApp session is starting. Try again in a few seconds.' });
    }
    if (error instanceof Error && error.message === 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE') {
      return res.status(409).json({ error: 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE', message: 'Could not generate QR or pairing code. Try again.' });
    }
    if (error instanceof Error && error.message === 'WAHA_SESSION_FAILED') {
      return res.status(409).json({ error: 'WAHA_SESSION_FAILED', message: 'WhatsApp session failed to start. Try again.' });
    }
    return res.status(502).json({ error: 'Could not start whatsapp link for session' });
  }
};
