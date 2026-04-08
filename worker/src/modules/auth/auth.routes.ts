import { Router } from 'express';
import { loginHandler, logoutHandler, meHandler } from './auth.controller.js';
import { requireAuth } from '../../modules/security/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/login', loginHandler);
authRouter.get('/me', requireAuth, meHandler);
authRouter.post('/logout', requireAuth, logoutHandler);
