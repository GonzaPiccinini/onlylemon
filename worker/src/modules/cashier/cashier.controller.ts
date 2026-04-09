import type { Request, Response } from 'express';
import {
  addFundsSchema,
  completeWhatsappLinkSchema,
  startWhatsappLinkSchema,
} from './cashier.types.js';
import {
  completeWhatsappLinkService,
  createAddFundsService,
  finishSessionService,
  getWhatsappLinkStateService,
  getWhatsappLinkStatusService,
  getCurrentSessionService,
  listAddFundsHistoryService,
  listClientPhonesService,
  refreshWhatsappLinkService,
  resetWhatsappLinkService,
  listSessionsService,
  startWhatsappLinkService,
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
  } catch {
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
