import type { Request, Response } from 'express';
import {
  cashierConversionsFilterSchema,
  completeWhatsappLinkSchema,
  createConversionSchema,
  startWhatsappLinkSchema,
  updateAccountSchema,
} from './cashier.types.js';
import {
  completeWhatsappLinkService,
  createConversionService,
  getConversionAmountLimits,
  createMySessionService,
  deleteMySessionService,
  enforceCashierCanOperateLeadsService,
  finishSessionService,
  getCashierRuntimeStateService,
  getWhatsappLinkStateService,
  getWhatsappLinkStatusService,
  getWhatsappLinkStatusForSessionService,
  getCurrentSessionService,
  listCashierConversionsService,
  listMySessionsService,
  refreshWhatsappLinkForSessionService,
  resetWhatsappLinkService,
  resetWhatsappLinkForSessionService,
  listSessionsService,
  searchCashierLeadsService,
  startWhatsappLinkForSessionService,
  startSessionService,
  updateCashierAccountService,
} from './cashier.service.js';
import {
  argentinaDayStartUtc,
  argentinaDayEndUtcExclusive,
} from '../../utils/timezone.js';

const getCashierId = (req: Request): string | null => req.authUser?.cashierId ?? null;

const ensureCashierCanOperateLeads = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    res.status(400).json({ error: 'Cashier profile not linked' });
    return null;
  }

  const access = await enforceCashierCanOperateLeadsService(cashierId);
  if (!access.allowed) {
    res.status(409).json({
      error: access.reason,
      runtime: access.runtime,
    });
    return null;
  }

  return cashierId;
};

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
  const cashierId = await ensureCashierCanOperateLeads(req, res);
  if (!cashierId) {
    return;
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

export const createConversionHandler = async (req: Request, res: Response) => {
  const cashierId = await ensureCashierCanOperateLeads(req, res);
  if (!cashierId) {
    return;
  }

  const parsed = createConversionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const limits = await getConversionAmountLimits();
  if (limits.min > 0 && parsed.data.amount < limits.min) {
    return res.status(400).json({
      error: `El monto minimo es ${limits.min}`,
    });
  }
  if (limits.max > 0 && parsed.data.amount > limits.max) {
    return res.status(400).json({
      error: `El monto maximo es ${limits.max}`,
    });
  }

  const result = await createConversionService(
    cashierId,
    req.params.leadId,
    parsed.data.amount,
  );

  if (result.kind === 'NOT_FOUND') {
    return res.status(404).json({ error: 'Lead not found' });
  }

  if (result.kind === 'INVALID_STATUS') {
    return res.status(409).json({ error: 'Lead is not in a convertible status' });
  }

  if (result.kind === 'PHONE_REQUIRED') {
    return res.status(422).json({ error: 'Lead phone is required' });
  }

  if (result.kind === 'CREATED') {
    return res.status(201).json({ conversion: result.conversion });
  }

  // DUPLICATE is not expected from the manual CAPI path (no sourceMessageId),
  // but handle it defensively — treat as a 409 conflict.
  return res.status(409).json({ error: 'Conversion already recorded' });
};

export const getConversionLimitsHandler = async (_req: Request, res: Response) => {
  const limits = await getConversionAmountLimits();
  return res.status(200).json(limits);
};

export const searchCashierLeadsHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const items = await searchCashierLeadsService(cashierId, q);
  return res.status(200).json({ items });
};

export const listCashierConversionsHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const parsed = cashierConversionsFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }

  const { dateFrom, dateTo, phone, code, amountMin, amountMax, page, pageSize } = parsed.data;

  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) {
    return res.status(400).json({ error: 'amountMin must be <= amountMax' });
  }

  const filters = {
    dateFrom: dateFrom ? argentinaDayStartUtc(dateFrom) : undefined,
    dateTo:   dateTo   ? argentinaDayEndUtcExclusive(dateTo) : undefined,
    phone,
    code,
    amountMin,
    amountMax,
  };

  const data = await listCashierConversionsService(cashierId, filters, page, pageSize);
  return res.status(200).json(data);
};

export const cashierRuntimeStateHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await getCashierRuntimeStateService(cashierId);
  return res.status(200).json(data);
};

export const updateAccountHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await updateCashierAccountService(cashierId, parsed.data);
    return res.status(200).json(data);
  } catch {
    return res.status(409).json({ error: 'Could not update account' });
  }
};

export const whatsappLinkStateHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await getWhatsappLinkStateService(cashierId);
  return res.status(200).json(data);
};

export const whatsappLinkResetHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  await resetWhatsappLinkService(cashierId);
  return res.status(204).send();
};

export const whatsappLinkStatusHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  try {
    const data = await getWhatsappLinkStatusService(cashierId);
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Could not fetch whatsapp session status' });
  }
};

export const whatsappLinkCompleteHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const parsed = completeWhatsappLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await completeWhatsappLinkService(cashierId, parsed.data.sessionName);
    if (!data) {
      return res.status(409).json({
        error: 'WHATSAPP_SESSION_NOT_WORKING',
      });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Could not complete whatsapp link' });
  }
};

// ---------------------------------------------------------------------------
// Batch 5 — Per-session cashier-scoped handlers (/cashier/me/sessions/*)
// ---------------------------------------------------------------------------

export const listMySessionsHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const data = await listMySessionsService(cashierId);
  return res.status(200).json(data);
};

export const createMySessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  try {
    const data = await createMySessionService(cashierId);
    return res.status(201).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_CAP_REACHED') {
      return res.status(409).json({ error: 'SESSION_CAP_REACHED', message: 'Maximum sessions reached for this cashier.' });
    }
    return res.status(502).json({ error: 'Could not create session' });
  }
};

export const deleteMySessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const { id: sessionId } = req.params;

  try {
    const data = await deleteMySessionService(cashierId, sessionId);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_OWNED') {
      return res.status(403).json({ error: 'SESSION_NOT_OWNED', message: 'This session does not belong to you.' });
    }
    return res.status(502).json({ error: 'Could not delete session' });
  }
};

export const linkMySessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const { id: sessionId } = req.params;

  const parsed = startWhatsappLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await startWhatsappLinkForSessionService(cashierId, sessionId, parsed.data.phoneNumber);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_OWNED') {
      return res.status(403).json({ error: 'SESSION_NOT_OWNED' });
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

export const refreshMySessionHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const { id: sessionId } = req.params;

  try {
    const data = await refreshWhatsappLinkForSessionService(cashierId, sessionId);
    if (!data) {
      return res.status(409).json({ error: 'MAX_REFRESH_REACHED', message: 'Maximum refresh attempts reached. Use reset to continue.' });
    }
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_OWNED') {
      return res.status(403).json({ error: 'SESSION_NOT_OWNED' });
    }
    if (error instanceof Error && error.message === 'PHONE_NUMBER_REQUIRED') {
      return res.status(409).json({ error: 'PHONE_NUMBER_REQUIRED', message: 'Phone number is required before requesting refresh.' });
    }
    if (error instanceof Error && error.message === 'SESSION_NAME_REQUIRED') {
      return res.status(409).json({ error: 'SESSION_NAME_REQUIRED', message: 'Session is not initialized. Start link flow again.' });
    }
    return res.status(502).json({ error: 'Could not refresh whatsapp session' });
  }
};

export const resetMySessionRefreshHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const { id: sessionId } = req.params;

  try {
    await resetWhatsappLinkForSessionService(cashierId, sessionId);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_OWNED') {
      return res.status(403).json({ error: 'SESSION_NOT_OWNED' });
    }
    return res.status(502).json({ error: 'Could not reset refresh counter' });
  }
};

export const getMySessionStatusHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const { id: sessionId } = req.params;

  try {
    const data = await getWhatsappLinkStatusForSessionService(cashierId, sessionId);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_OWNED') {
      return res.status(403).json({ error: 'SESSION_NOT_OWNED' });
    }
    return res.status(502).json({ error: 'Could not get session status' });
  }
};
