import { NextFunction, Request, Response } from 'express';

export const requireJsonContentType = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.is('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json' });
    return;
  }

  next();
};
