import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  setupHandler,
  setupStatusHandler,
} from './auth.controller.js';
import { requireAuth } from '../../modules/security/auth.middleware.js';

export const authRouter = Router();

// Public endpoints — MUST be registered before any requireAuth middleware
authRouter.get('/setup-status', setupStatusHandler);
authRouter.post('/setup', setupHandler);
authRouter.post('/login', loginHandler);

// Authenticated endpoints
authRouter.get('/me', requireAuth, meHandler);
authRouter.post('/logout', requireAuth, logoutHandler);
