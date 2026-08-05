import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { TTLockService } from '../services/ttlockService';

export class LocksController {
  /**
   * Method A: In-app Button Door Unlock
   * Triggered when authorized user presses "Open door" inside mobile app.
   */
  public static async unlockByAppButton(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { booking_id } = req.body;

      if (!booking_id) {
        return res.status(400).json({ success: false, message: 'Укажите ID бронирования' });
      }

      const booking = await prisma.booking.findUnique({
        where: { id: booking_id },
        include: {
          ground: {
            include: { gateways: true },
          },
          guests: true,
        },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      // Check if user is host or approved guest
      const isHost = booking.host_user_id === req.user.id;
      const isApprovedGuest = booking.guests.some(
        (g) => g.user_id === req.user?.id && g.status === 'approved'
      );

      if (!isHost && !isApprovedGuest) {
        return res.status(403).json({
          success: false,
          message: 'У вас нет доступа к этой брони для разблокировки замка',
        });
      }

      // Validate time window
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      if (booking.booking_date !== currentDateStr || currentTimeStr < booking.start_time || currentTimeStr > booking.end_time) {
        return res.status(400).json({
          success: false,
          message: `Время сеанса (${booking.start_time} - ${booking.end_time}) еще не наступило или уже завершилось`,
        });
      }

      // Determine Gateway online status
      const gateway = booking.ground.gateways[0];
      const isGatewayOnline = gateway ? gateway.status === 'online' : true;

      // Execute TTLock Unlock
      const unlockResult = await TTLockService.unlockLock(
        booking.ground.ttlock_lock_id,
        isGatewayOnline
      );

      // Log unlock operation
      await prisma.lockLog.create({
        data: {
          booking_id: booking.id,
          user_id: req.user.id,
          ground_id: booking.ground.id,
          method: 'app_button',
          unlock_type: unlockResult.mode,
          success: unlockResult.success,
          details: unlockResult.message,
        },
      });

      return res.json({
        success: unlockResult.success,
        data: unlockResult,
      });
    } catch (error: any) {
      console.error('[LocksController.unlockByAppButton]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Method B: Static Door QR Code Scan Unlock
   * Triggered when user scans static QR code on physical door.
   */
  public static async unlockByDoorQr(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { qr_code_token } = req.body;

      if (!qr_code_token) {
        return res.status(400).json({ success: false, message: 'Укажите токен QR-кода двери' });
      }

      const ground = await prisma.ground.findUnique({
        where: { qr_code_token },
        include: { gateways: true },
      });

      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      // Find current active booking for this ground
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

      const currentBooking = activeBookings.find(
        (b) => currentTimeStr >= b.start_time && currentTimeStr <= b.end_time
      );

      if (!currentBooking) {
        return res.status(400).json({
          success: false,
          message: 'На данной площадке в данный момент нет активного забронированного сеанса',
        });
      }

      // Check if user is host or guest
      let isHost = currentBooking.host_user_id === req.user.id;
      let isGuest = currentBooking.guests.some((g) => g.user_id === req.user?.id);

      // If user is neither host nor guest, attempt spontaneous QR check-in if slots available (<15)
      if (!isHost && !isGuest) {
        const totalCount = 1 + currentBooking.guests.length;
        if (totalCount >= 15) {
          return res.status(400).json({
            success: false,
            message: 'Все места на этот сеанс заполнены. Доступ запрещен.',
          });
        }

        // Auto-add as spontaneous guest
        await prisma.bookingGuest.create({
          data: {
            booking_id: currentBooking.id,
            user_id: req.user.id,
            type: 'spontaneous_check_in',
            status: 'approved',
          },
        });
      }

      // Determine Gateway Online Status
      const gateway = ground.gateways[0];
      const isGatewayOnline = gateway ? gateway.status === 'online' : true;

      // Execute TTLock unlock
      const unlockResult = await TTLockService.unlockLock(
        ground.ttlock_lock_id,
        isGatewayOnline
      );

      // Log unlock operation
      await prisma.lockLog.create({
        data: {
          booking_id: currentBooking.id,
          user_id: req.user.id,
          ground_id: ground.id,
          method: 'qr_code',
          unlock_type: unlockResult.mode,
          success: unlockResult.success,
          details: unlockResult.message,
        },
      });

      return res.json({
        success: unlockResult.success,
        data: {
          ...unlockResult,
          booking_id: currentBooking.id,
          ground_name: ground.name,
        },
      });
    } catch (error: any) {
      console.error('[LocksController.unlockByDoorQr]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
