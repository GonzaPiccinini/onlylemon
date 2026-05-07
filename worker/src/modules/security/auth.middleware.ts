import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import type { AuthenticatedUser, Role } from '../../types/api.js';
import { findAdminStatusByUserId, findCashierStatusByUserId } from '../auth/auth.repository.js';

const unauthorized = (res: Response) =>
  res.status(401).json({ error: 'Unauthorized' });

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const header = req.header('authorization');
  if (!header) {
    return unauthorized(res);
  }

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthenticatedUser;
    if (decoded.role === 'CASHIER') {
      const status = await findCashierStatusByUserId(decoded.userId);
      if (status !== 'ACTIVE') {
        return unauthorized(res);
      }
    }
    if (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN') {
      const status = await findAdminStatusByUserId(decoded.userId);
      if (status !== 'ACTIVE') {
        return unauthorized(res);
      }
    }

    req.authUser = decoded;
    return next();
  } catch {
    return unauthorized(res);
  }
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return unauthorized(res);
    }

    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
