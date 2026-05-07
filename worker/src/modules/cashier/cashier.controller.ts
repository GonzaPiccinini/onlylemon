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
  enforceCashierCanOperateLeadsService,
  finishSessionService,
  getCashierRuntimeStateService,
  getWhatsappLinkStateService,
  getWhatsappLinkStatusService,
  getCurrentSessionService,
  listCashierConversionsService,
  refreshWhatsappLinkService,
  resetWhatsappLinkService,
  listSessionsService,
  searchCashierLeadsService,
  startWhatsappLinkService,
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

  return res.status(201).json({ conversion: result.conversion });
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

export const whatsappLinkStartHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  const parsed = startWhatsappLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  try {
    const data = await startWhatsappLinkService(cashierId, parsed.data.phoneNumber);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'WAHA_SESSION_NOT_READY') {
      return res.status(409).json({
        error: 'WAHA_SESSION_NOT_READY',
        message: 'WhatsApp session is starting. Try again in a few seconds.',
      });
    }

    if (error instanceof Error && error.message === 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE') {
      return res.status(409).json({
        error: 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE',
        message: 'Could not generate QR or pairing code. Try again.',
      });
    }

    if (error instanceof Error && error.message === 'WAHA_SESSION_FAILED') {
      return res.status(409).json({
        error: 'WAHA_SESSION_FAILED',
        message: 'WhatsApp session failed to start. Try again.',
      });
    }

    if (error instanceof Error && error.message.startsWith('WAHA_START_FAILED:')) {
      return res.status(502).json({
        error: 'WAHA_START_FAILED',
        message: 'Could not start WhatsApp session in WAHA.',
      });
    }

    if (error instanceof Error && error.message === 'WAHA_SESSION_NAME_TOO_LONG') {
      return res.status(409).json({
        error: 'WAHA_SESSION_NAME_TOO_LONG',
        message: 'Generated WhatsApp session name is too long. Try again.',
      });
    }

    return res.status(502).json({ error: 'Could not request whatsapp auth artifacts' });
  }
};

export const whatsappLinkRefreshHandler = async (req: Request, res: Response) => {
  const cashierId = getCashierId(req);
  if (!cashierId) {
    return res.status(400).json({ error: 'Cashier profile not linked' });
  }

  try {
    const data = await refreshWhatsappLinkService(cashierId);
    if (!data) {
      return res.status(409).json({
        error: 'MAX_REFRESH_REACHED',
        message: 'Maximum refresh attempts reached. Use reset to continue.',
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'PHONE_NUMBER_REQUIRED') {
      return res.status(409).json({
        error: 'PHONE_NUMBER_REQUIRED',
        message: 'Phone number is required before requesting refresh.',
      });
    }

    if (error instanceof Error && error.message === 'SESSION_NAME_REQUIRED') {
      return res.status(409).json({
        error: 'SESSION_NAME_REQUIRED',
        message: 'Session is not initialized. Start link flow again.',
      });
    }

    return res.status(502).json({ error: 'Could not refresh whatsapp auth artifacts' });
  }
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
