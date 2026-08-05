import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';

export class BookingsController {
  /**
   * Host creates a new booking slot for a sports ground
   */
  public static async createBooking(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { ground_id, booking_date, start_time, end_time, total_price } = req.body;

      if (!ground_id || !booking_date || !start_time || !end_time) {
        return res.status(400).json({
          success: false,
          message: 'Укажите площадка, дату (YYYY-MM-DD), время начала и окончания (HH:mm)',
        });
      }

      // Verify ground exists
      const ground = await prisma.ground.findUnique({ where: { id: ground_id } });
      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      // Check for overlapping bookings
      const existingOverlap = await prisma.booking.findFirst({
        where: {
          ground_id,
          booking_date,
          status: 'confirmed',
          OR: [
            {
              AND: [{ start_time: { lte: start_time } }, { end_time: { gt: start_time } }],
            },
            {
              AND: [{ start_time: { lt: end_time } }, { end_time: { gte: end_time } }],
            },
          ],
        },
      });

      if (existingOverlap) {
        return res.status(400).json({
          success: false,
          message: 'Данное время на выбранной площадке уже забронировано',
        });
      }

      const invite_token = uuidv4();

      const booking = await prisma.booking.create({
        data: {
          ground_id,
          host_user_id: req.user.id,
          booking_date,
          start_time,
          end_time,
          total_price: total_price ? parseFloat(total_price) : ground.cost_per_hour,
          status: 'confirmed',
          payment_status: 'paid',
          invite_token,
        },
        include: {
          ground: true,
          host_user: {
            select: { id: true, full_name: true, phone_number: true, iin: true },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Бронирование успешно создано',
        data: booking,
      });
    } catch (error: any) {
      console.error('[BookingsController.createBooking]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get user's bookings (hosted & joined as guest)
   */
  public static async getMyBookings(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const hostedBookings = await prisma.booking.findMany({
        where: { host_user_id: req.user.id },
        include: {
          ground: true,
          guests: {
            include: {
              user: { select: { id: true, full_name: true, phone_number: true } },
            },
          },
        },
        orderBy: { booking_date: 'desc' },
      });

      const joinedGuestSlots = await prisma.bookingGuest.findMany({
        where: { user_id: req.user.id },
        include: {
          booking: {
            include: {
              ground: true,
              host_user: { select: { id: true, full_name: true, phone_number: true } },
              guests: {
                include: { user: { select: { id: true, full_name: true } } },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return res.json({
        success: true,
        data: {
          hosted: hostedBookings,
          joined: joinedGuestSlots.map((g) => g.booking),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Generate / get dynamic invitation link token for a booking
   */
  public static async getInviteLink(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({ where: { id } });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      if (booking.host_user_id !== req.user?.id) {
        return res.status(403).json({ success: false, message: 'Только хозяин бронирования может приглашать друзей' });
      }

      return res.json({
        success: true,
        data: {
          invite_token: booking.invite_token,
          invite_url: `/api/v1/invitations/${booking.invite_token}`,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get details of an invitation by token (Scenario 1 view)
   */
  public static async getInvitationByToken(req: Request, res: Response) {
    try {
      const { token } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { invite_token: token },
        include: {
          ground: true,
          host_user: { select: { id: true, full_name: true, phone_number: true } },
          guests: {
            include: { user: { select: { id: true, full_name: true } } },
          },
        },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Приглашение не найдено или недействительно' });
      }

      const totalParticipants = 1 + booking.guests.length; // Host + Guests
      const availableSlots = Math.max(0, 15 - totalParticipants);

      return res.json({
        success: true,
        data: {
          booking: {
            id: booking.id,
            ground: booking.ground,
            host: booking.host_user,
            date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
          },
          totalParticipants,
          availableSlots,
          isFull: totalParticipants >= 15,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Accept Pre-invitation Link (Scenario 1: friend joins slot)
   * Max 15 capacity limit!
   */
  public static async acceptInvitation(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { token } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { invite_token: token },
        include: { guests: true },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Приглашение не найдено' });
      }

      // Host cannot join their own booking as a guest
      if (booking.host_user_id === req.user.id) {
        return res.status(400).json({ success: false, message: 'Вы являетесь хозяином этой брони' });
      }

      // Check current participant count (Host = 1, Guests = booking.guests.length)
      const currentParticipantsCount = 1 + booking.guests.length;

      if (currentParticipantsCount >= 15) {
        return res.status(400).json({
          success: false,
          message: 'Все места на этот сеанс заполнены',
        });
      }

      // Check if user is already a guest
      const alreadyGuest = booking.guests.some((g) => g.user_id === req.user?.id);
      if (alreadyGuest) {
        return res.status(400).json({ success: false, message: 'Вы уже присоединились к этой игре' });
      }

      // Add to slot as invited guest
      const guest = await prisma.bookingGuest.create({
        data: {
          booking_id: booking.id,
          user_id: req.user.id,
          type: 'invited',
          status: 'approved', // Beta default
        },
        include: {
          user: { select: { id: true, full_name: true, phone_number: true } },
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Вы успешно присоединились к игре по приглашению!',
        data: guest,
      });
    } catch (error: any) {
      console.error('[BookingsController.acceptInvitation]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Spontaneous Guest Check-in via Door Static QR (Scenario 2)
   * Scans static door QR code token during active session.
   * Max 15 capacity check!
   */
  public static async spontaneousQrCheckIn(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { qr_code_token } = req.body;

      if (!qr_code_token) {
        return res.status(400).json({ success: false, message: 'Укажите токен QR-кода площадки' });
      }

      const ground = await prisma.ground.findUnique({ where: { qr_code_token } });
      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      // Find active booking right now
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      const activeBookings = await prisma.booking.findMany({
        where: {
          ground_id: ground.id,
          booking_date: currentDateStr,
          status: 'confirmed',
        },
        include: { guests: true },
      });

      const currentActiveBooking = activeBookings.find(
        (b) => currentTimeStr >= b.start_time && currentTimeStr <= b.end_time
      );

      if (!currentActiveBooking) {
        return res.status(400).json({
          success: false,
          message: 'На данной площадке сейчас нет активного сеанса игры',
        });
      }

      // Check capacity limit (Host = 1, Guests = currentActiveBooking.guests.length)
      const currentCount = 1 + currentActiveBooking.guests.length;

      if (currentCount >= 15) {
        return res.status(400).json({
          success: false,
          message: 'Все места на этот сеанс заполнены',
        });
      }

      // If user is host
      if (currentActiveBooking.host_user_id === req.user.id) {
        return res.json({
          success: true,
          message: 'Вы являетесь хозяином текущей брони',
          data: { role: 'host', booking_id: currentActiveBooking.id },
        });
      }

      // Check if user is already a guest
      const existingGuest = currentActiveBooking.guests.find((g) => g.user_id === req.user?.id);
      if (existingGuest) {
        return res.json({
          success: true,
          message: 'Вы уже записаны в этот сеанс',
          data: existingGuest,
        });
      }

      // Add user as spontaneous guest
      const newGuest = await prisma.bookingGuest.create({
        data: {
          booking_id: currentActiveBooking.id,
          user_id: req.user.id,
          type: 'spontaneous_check_in',
          status: 'approved', // Beta default
        },
        include: {
          user: { select: { id: true, full_name: true, phone_number: true } },
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Вы успешно присоединились к активному сеансу на площадке!',
        data: newGuest,
      });
    } catch (error: any) {
      console.error('[BookingsController.spontaneousQrCheckIn]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
