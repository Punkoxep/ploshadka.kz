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
          message: 'Слот свободен. Пожалуйста, забронируйте площадку через расписание',
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
      const existingGuest = currentActiveBooking.guests.find((g) => g.user_id === req.user?.id && g.status === 'approved');
      if (existingGuest) {
        return res.json({
          success: true,
          message: 'Вы уже записаны в этот сеанс',
          data: existingGuest,
        });
      }

      // Check if user already submitted a join request
      const existingRequests = await prisma.joinRequest.findMany({
        where: {
          booking_id: currentActiveBooking.id,
          user_iin: req.user.iin,
        },
      });

      const activeReq = existingRequests.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
      if (activeReq) {
        return res.json({
          success: true,
          message: activeReq.status === 'APPROVED' ? 'Ваша заявка на присоединение уже одобрена' : 'Запрос на спонтанный вход отправлен хозяину слота. Ожидайте одобрения',
          data: activeReq,
        });
      }

      // Create JoinRequest with status PENDING for host review (DO NOT add to BookingGuest yet)
      const joinRequest = await prisma.joinRequest.create({
        data: {
          booking_id: currentActiveBooking.id,
          user_iin: req.user.iin,
          user_name: req.user.full_name,
          user_phone: req.user.phone_number,
          status: 'PENDING',
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Запрос на спонтанный вход отправлен хозяину слота. Ожидайте одобрения',
        data: joinRequest,
      });
    } catch (error: any) {
      console.error('[BookingsController.spontaneousQrCheckIn]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all active/confirmed bookings (for browsing occupied slots to request join)
   */
  public static async getAllBookings(req: Request, res: Response) {
    try {
      const bookings = await prisma.booking.findMany({
        where: { status: 'confirmed' },
        include: {
          ground: true,
          host_user: { select: { id: true, full_name: true, phone_number: true, iin: true } },
          guests: {
            include: { user: { select: { id: true, full_name: true, phone_number: true, iin: true } } },
          },
          joinRequests: true,
        },
        orderBy: [{ booking_date: 'asc' }, { start_time: 'asc' }],
      });

      return res.json({
        success: true,
        data: bookings,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send a request to join an occupied slot (JoinRequest PENDING)
   */
  public static async requestJoinSlot(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { id } = req.params; // booking_id
      const { user_name, user_phone, user_iin } = req.body;

      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { guests: true, joinRequests: true },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      if (booking.host_user_id === req.user.id) {
        return res.status(400).json({ success: false, message: 'Вы являетесь хозяином этого слота' });
      }

      const applicantIin = user_iin || req.user.iin;
      let applicantName = user_name || req.user?.full_name;
      const applicantPhone = user_phone || req.user?.phone_number;

      // Ensure valid name: if missing or containing '?', look up authentic User record by IIN/phone
      if (!applicantName || applicantName.includes('?')) {
        const foundUser = await prisma.user.findFirst({
          where: {
            OR: [
              { iin: applicantIin },
              { phone_number: applicantPhone },
            ],
          },
        });
        if (foundUser && foundUser.full_name) {
          applicantName = foundUser.full_name;
        }
      }

      if (!applicantName || applicantName.includes('?')) {
        applicantName = 'Участник';
      }

      // Check if user is already a guest
      const isAlreadyGuest = booking.guests.some((g) => g.user_id === req.user?.id);
      if (isAlreadyGuest) {
        return res.status(400).json({ success: false, message: 'Вы уже являетесь участником этой игры' });
      }

      // Check if user already submitted a request
      const existingRequest = booking.joinRequests.find(
        (r) => r.user_iin === applicantIin && (r.status === 'PENDING' || r.status === 'APPROVED')
      );
      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: existingRequest.status === 'APPROVED' 
            ? 'Ваша заявка на присоединение уже одобрена' 
            : 'Вы уже отправили заявку на присоединение. Ожидайте ответа хозяина.',
        });
      }

      const joinRequest = await prisma.joinRequest.create({
        data: {
          booking_id: booking.id,
          user_iin: applicantIin,
          user_name: applicantName,
          user_phone: applicantPhone,
          status: 'PENDING',
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Заявка на присоединение к слоту успешно отправлена!',
        data: joinRequest,
      });
    } catch (error: any) {
      console.error('[BookingsController.requestJoinSlot]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all join requests for a booking slot
   */
  public static async getBookingJoinRequests(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { id } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { id },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      if (booking.host_user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'У вас нет прав для просмотра заявок этого слота' });
      }

      const requests = await prisma.joinRequest.findMany({
        where: { booking_id: id },
        orderBy: { created_at: 'desc' },
      });

      return res.json({
        success: true,
        data: requests,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/bookings/requests
   * Get all incoming PENDING join requests for bookings hosted by current user
   */
  public static async getHostIncomingRequests(req: AuthenticatedRequest, res: Response) {
    try {
      const userIin = (req.user?.iin) || (req.headers['x-user-iin'] as string) || (req.query.userIin as string);

      let hostUser;
      if (userIin) {
        hostUser = await prisma.user.findFirst({ where: { iin: userIin } });
      } else if (req.user?.id) {
        hostUser = req.user;
      }

      if (!hostUser) {
        return res.json({ success: true, data: [] });
      }

      // Find all join requests for bookings hosted by this user
      const requests = await prisma.joinRequest.findMany({
        where: {
          booking: {
            host_user_id: hostUser.id,
          },
        },
        include: {
          booking: {
            include: { ground: true },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // Sanitize requests to guarantee user_name is valid UTF-8 and populated
      const sanitizedRequests = await Promise.all(
        requests.map(async (r) => {
          let name = r.user_name;
          if (!name || name.includes('?')) {
            const matchedUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { iin: r.user_iin },
                  { phone_number: r.user_phone },
                ],
              },
            });
            if (matchedUser?.full_name) {
              name = matchedUser.full_name;
            }
          }
          return {
            ...r,
            user_name: name || 'Участник',
          };
        })
      );

      return res.json({
        success: true,
        data: sanitizedRequests,
      });
    } catch (error: any) {
      console.error('[BookingsController.getHostIncomingRequests]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Host approves (APPROVED) or rejects (REJECTED) a join request
   */
  public static async respondJoinRequest(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { requestId } = req.params;
      const { status } = req.body; // 'APPROVED' | 'REJECTED'

      if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Укажите статус: APPROVED или REJECTED' });
      }

      const joinRequest = await prisma.joinRequest.findUnique({
        where: { id: requestId },
        include: { booking: true },
      });

      if (!joinRequest) {
        return res.status(404).json({ success: false, message: 'Заявка не найдена' });
      }

      if (joinRequest.booking.host_user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Только хозяин слота может принимать или отклонять заявки' });
      }

      const updatedRequest = await prisma.joinRequest.update({
        where: { id: requestId },
        data: { status },
      });

      // If approved, automatically add applicant as an approved guest to BookingGuest and send TTLock unlock
      if (status === 'APPROVED') {
        const fullRequest = await prisma.joinRequest.findUnique({
          where: { id: requestId },
          include: {
            booking: {
              include: { ground: { include: { gateways: true } } },
            },
          },
        });

        if (fullRequest) {
          const applicantUser = await prisma.user.findFirst({
            where: {
              OR: [
                { iin: fullRequest.user_iin },
                { phone_number: fullRequest.user_phone },
              ],
            },
          });

          if (applicantUser) {
            const existingGuest = await prisma.bookingGuest.findUnique({
              where: {
                booking_id_user_id: {
                  booking_id: fullRequest.booking_id,
                  user_id: applicantUser.id,
                },
              },
            });

            if (!existingGuest) {
              await prisma.bookingGuest.create({
                data: {
                  booking_id: fullRequest.booking_id,
                  user_id: applicantUser.id,
                  type: fullRequest.status === 'PENDING_SPONTANEOUS' ? 'spontaneous_check_in' : 'invited',
                  status: 'approved',
                },
              });
            }
          }

          // Trigger physical TTLock unlock for spontaneous gate check-in
          const { TTLockService } = require('../services/ttlockService');
          const gateway = fullRequest.booking.ground.gateways[0];
          const isGatewayOnline = gateway ? gateway.status === 'online' : true;
          const unlockRes = await TTLockService.unlockLock(fullRequest.booking.ground.ttlock_lock_id, isGatewayOnline);

          // Log unlock operation
          await prisma.lockLog.create({
            data: {
              booking_id: fullRequest.booking_id,
              user_id: req.user.id,
              ground_id: fullRequest.booking.ground.id,
              method: 'host_approval_qr',
              unlock_type: unlockRes.mode,
              success: unlockRes.success,
              details: `Хозяин одобрил заявку ${fullRequest.user_name} (${fullRequest.user_iin}). Замок разблокирован.`,
            },
          });
        }
      }

      return res.json({
        success: true,
        message: status === 'APPROVED' ? 'Заявка одобрена! Команда разблокировки двери отправлена замку TTLock.' : 'Заявка отклонена',
        data: updatedRequest,
      });
    } catch (error: any) {
      console.error('[BookingsController.respondJoinRequest]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Host cancels a booking slot (status: 'CANCELLED')
   */
  public static async cancelBooking(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { id } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { ground: true },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      if (booking.host_user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Только хозяин бронирования может отменить этот слот',
        });
      }

      if (booking.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Это бронирование уже отменено',
        });
      }

      const updatedBooking = await prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          payment_status: 'refunded',
        },
        include: { ground: true },
      });

      return res.json({
        success: true,
        message: 'Бронирование успешно отменено. Доступ к замку аннулирован, а слот освобожден.',
        data: updatedBooking,
      });
    } catch (error: any) {
      console.error('[BookingsController.cancelBooking]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Host removes (kicks) a guest/participant from a booking slot
   */
  public static async removeGuest(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { bookingId, guestId } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      if (booking.host_user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Только хозяин бронирования может удалять участников',
        });
      }

      const bookingGuest = await prisma.bookingGuest.findUnique({
        where: { id: guestId },
        include: { user: true },
      });

      if (!bookingGuest || bookingGuest.booking_id !== bookingId) {
        return res.status(404).json({ success: false, message: 'Участник не найден в данном бронировании' });
      }

      // Delete the BookingGuest record
      await prisma.bookingGuest.delete({
        where: { id: guestId },
      });

      // Revoke any corresponding JoinRequest for that user on this booking
      if (bookingGuest.user) {
        await prisma.joinRequest.updateMany({
          where: {
            booking_id: bookingId,
            OR: [
              { user_iin: bookingGuest.user.iin },
              { user_phone: bookingGuest.user.phone_number },
            ],
          },
          data: { status: 'REMOVED' },
        });
      }

      return res.json({
        success: true,
        message: `Участник "${bookingGuest.user?.full_name || 'Гость'}" успешно удален из слота. Доступ к замку аннулирован.`,
      });
    } catch (error: any) {
      console.error('[BookingsController.removeGuest]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}



