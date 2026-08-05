import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { ENV } from '../config/env';
import { validateIIN, formatRKPhone } from '../utils/iinValidator';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

export class AuthController {
  /**
   * User Registration with strict IIN validation and auto-extraction of birth date and gender.
   * Expected DTO: { iin, phone_number, full_name, password }
   */
  public static async register(req: Request, res: Response) {
    try {
      const { iin, phone_number, full_name, password } = req.body;

      if (!iin || !phone_number || !full_name || !password) {
        return res.status(400).json({
          success: false,
          message: 'Все поля (ИИН, номер телефона, ФИО, пароль) обязательны для заполнения',
        });
      }

      // Validate IIN strictly
      const iinResult = validateIIN(iin);
      if (!iinResult.isValid || !iinResult.birthDate || !iinResult.gender) {
        return res.status(400).json({
          success: false,
          message: `Ошибка валидации ИИН: ${iinResult.error}`,
        });
      }

      const formattedPhone = formatRKPhone(phone_number);

      // Check if user already exists
      const existingIin = await prisma.user.findUnique({ where: { iin: iin.trim() } });
      if (existingIin) {
        return res.status(400).json({ success: false, message: 'Пользователь с таким ИИН уже зарегистрирован' });
      }

      const existingPhone = await prisma.user.findUnique({ where: { phone_number: formattedPhone } });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: 'Пользователь с таким номером телефона уже зарегистрирован' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Create User with auto-computed birth_date & gender from IIN
      const user = await prisma.user.create({
        data: {
          iin: iin.trim(),
          phone_number: formattedPhone,
          full_name: full_name.trim(),
          birth_date: iinResult.birthDate,
          gender: iinResult.gender,
          password_hash,
          role: 'client',
        },
      });

      // Generate JWT Token
      const token = jwt.sign(
        {
          id: user.id,
          iin: user.iin,
          phone_number: user.phone_number,
          full_name: user.full_name,
          role: user.role,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { password_hash: _, ...userWithoutPassword } = user;

      return res.status(201).json({
        success: true,
        message: 'Пользователь успешно зарегистрирован. Дата рождения и пол высчитаны автоматически из ИИН.',
        data: {
          user: userWithoutPassword,
          token,
        },
      });
    } catch (error: any) {
      console.error('[AuthController.register] Error:', error);
      return res.status(500).json({ success: false, message: `Ошибка при регистрации: ${error.message}` });
    }
  }

  /**
   * User Login via Phone or IIN + Password
   */
  public static async login(req: Request, res: Response) {
    try {
      const { phone_or_iin, password } = req.body;

      if (!phone_or_iin || !password) {
        return res.status(400).json({
          success: false,
          message: 'Укажите ИИН/Телефон и пароль',
        });
      }

      const queryInput = phone_or_iin.trim();
      const formattedPhone = formatRKPhone(queryInput);

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { iin: queryInput },
            { phone_number: formattedPhone },
            { phone_number: queryInput },
          ],
        },
      });

      if (!user) {
        return res.status(401).json({ success: false, message: 'Пользователь не найден' });
      }

      if (user.is_blocked) {
        return res.status(403).json({ success: false, message: 'Учетная запись заблокирована администратором' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Неверный пароль' });
      }

      const token = jwt.sign(
        {
          id: user.id,
          iin: user.iin,
          phone_number: user.phone_number,
          full_name: user.full_name,
          role: user.role,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { password_hash: _, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        message: 'Успешный вход в систему',
        data: {
          user: userWithoutPassword,
          token,
        },
      });
    } catch (error: any) {
      console.error('[AuthController.login] Error:', error);
      return res.status(500).json({ success: false, message: `Ошибка входа: ${error.message}` });
    }
  }

  /**
   * Get Current Authenticated Profile
   */
  public static async getMe(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Не авторизован' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          iin: true,
          phone_number: true,
          full_name: true,
          birth_date: true,
          gender: true,
          role: true,
          is_blocked: true,
          created_at: true,
        },
      });

      return res.json({ success: true, data: user });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
