import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface AuthUser {
  id: string;
  iin: string;
  phone_number: string;
  role: string;
  full_name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const authenticateJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Отсутствует или недействителен токен авторизации (Bearer token)' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Недействительный или просроченный токен авторизации' });
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Доступ запрещен: требуются права администратора' });
  }
  next();
};
