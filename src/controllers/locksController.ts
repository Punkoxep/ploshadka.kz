import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { TTLockService } from '../services/ttlockService';

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export class LocksController {
  /**
   * Method A: In-app Button Door Unlock
   * Triggered when authorized user presses "Open door" inside mobile app.
   */
  public static async unlockByAppButton(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const { booking_id, userLatitude, user_latitude, userLongitude, user_longitude } = req.body;

      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      let booking;

      if (booking_id) {
        booking = await prisma.booking.findUnique({
          where: { id: booking_id },
          include: {
            ground: { include: { gateways: true } },
            guests: true,
            joinRequests: true,
          },
        });
      } else {
        // Auto-detect active booking for user right now
        const activeBookings = await prisma.booking.findMany({
          where: {
            booking_date: currentDateStr,
            status: 'confirmed',
          },
          include: {
            ground: { include: { gateways: true } },
            guests: true,
            joinRequests: true,
          },
        });

        booking = activeBookings.find((b) => {
          if (currentTimeStr < b.start_time || currentTimeStr > b.end_time) return false;

          const isHost = b.host_user_id === req.user?.id;
          const isApprovedGuest = b.guests.some((g) => g.user_id === req.user?.id && g.status === 'approved');
          const isApprovedJoinRequest = b.joinRequests.some(
            (r) => (r.user_iin === req.user?.iin || r.user_phone === req.user?.phone_number) && r.status === 'APPROVED'
          );

          return isHost || isApprovedGuest || isApprovedJoinRequest;
        });

        if (!booking) {
          return res.status(400).json({
            success: false,
            message: 'У вас нет активного забронированного сеанса в данный момент',
          });
        }
      }

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Бронирование не найдено' });
      }

      // Check if user is host, approved guest, or has an approved join request
      const isHost = booking.host_user_id === req.user.id;
      const isApprovedGuest = booking.guests.some(
        (g) => g.user_id === req.user?.id && g.status === 'approved'
      );
      const isApprovedJoinRequest = booking.joinRequests.some(
        (r) => (r.user_iin === req.user?.iin || r.user_phone === req.user?.phone_number) && r.status === 'APPROVED'
      );

      if (!isHost && !isApprovedGuest && !isApprovedJoinRequest) {
        return res.status(403).json({
          success: false,
          message: 'У вас нет доступа к этой брони для разблокировки замка',
        });
      }

      // Validate time window
      if (booking.booking_date !== currentDateStr || currentTimeStr < booking.start_time || currentTimeStr > booking.end_time) {
        return res.status(400).json({
          success: false,
          message: `Время сеанса (${booking.start_time} - ${booking.end_time}) еще не наступило или уже завершилось`,
        });
      }

      // GPS Geolocation Check (Haversine Formula)
      const userLat = userLatitude !== undefined ? Number(userLatitude) : (user_latitude !== undefined ? Number(user_latitude) : booking.ground.latitude);
      const userLon = userLongitude !== undefined ? Number(userLongitude) : (user_longitude !== undefined ? Number(user_longitude) : booking.ground.longitude);

      const distanceMeters = calculateDistanceMeters(userLat, userLon, booking.ground.latitude, booking.ground.longitude);
      const allowedRadius = booking.ground.allowed_radius_meters || 50;

      if (distanceMeters > allowedRadius) {
        return res.status(400).json({
          success: false,
          doorUnlocked: false,
          message: `Вы находитесь слишком далеко от площадки (расстояние ${Math.round(distanceMeters)}м, требуется находиться в пределах ${allowedRadius}м)`,
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

      // Mark booking as door opened to prevent No-Show ban
      await prisma.booking.update({
        where: { id: booking.id },
        data: { is_door_opened: true },
      });

      return res.json({
        success: unlockResult.success,
        doorUnlocked: true,
        data: {
          ...unlockResult,
          booking_id: booking.id,
          ground_name: booking.ground.name,
        },
      });
    } catch (error: any) {
      console.error('[LocksController.unlockByAppButton]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/locks/active-access
   * Checks if current user has active door access right now
   */
  public static async getActiveAccess(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      const activeBookings = await prisma.booking.findMany({
        where: {
          booking_date: currentDateStr,
          status: 'confirmed',
        },
        include: {
          ground: true,
          guests: true,
          joinRequests: true,
        },
      });

      const currentActive = activeBookings.find((b) => {
        if (currentTimeStr < b.start_time || currentTimeStr > b.end_time) return false;

        const isHost = b.host_user_id === req.user?.id;
        const isApprovedGuest = b.guests.some((g) => g.user_id === req.user?.id && g.status === 'approved');
        const isApprovedJoinRequest = b.joinRequests.some(
          (r) => (r.user_iin === req.user?.iin || r.user_phone === req.user?.phone_number) && r.status === 'APPROVED'
        );

        return isHost || isApprovedGuest || isApprovedJoinRequest;
      });

      if (!currentActive) {
        return res.json({
          success: true,
          hasAccess: false,
          data: null,
        });
      }

      const role = currentActive.host_user_id === req.user.id ? 'Хозяин слота' : 'Участник команды';

      return res.json({
        success: true,
        hasAccess: true,
        data: {
          booking_id: currentActive.id,
          ground_id: currentActive.ground.id,
          ground_name: currentActive.ground.name,
          qr_code_token: currentActive.ground.qr_code_token,
          timeSlot: `${currentActive.start_time} - ${currentActive.end_time}`,
          role,
        },
      });
    } catch (error: any) {
      console.error('[LocksController.getActiveAccess]', error);
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

      const { qr_code_token, userLatitude, user_latitude, userLongitude, user_longitude } = req.body;

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
        include: { guests: true, joinRequests: true },
      });

      const currentBooking = activeBookings.find(
        (b) => currentTimeStr >= b.start_time && currentTimeStr <= b.end_time
      );

      // CASE A: Ground is currently completely FREE (No active booking)
      if (!currentBooking) {
        return res.status(400).json({
          success: false,
          doorUnlocked: false,
          message: 'Слот свободен. Для входа забронируйте площадку в приложении',
        });
      }

      // CASE B: Ground is OCCUPIED by active booking
      const isHost = currentBooking.host_user_id === req.user.id;
      const isApprovedGuest = currentBooking.guests.some((g) => g.user_id === req.user?.id && g.status === 'approved');
      const isApprovedJoinRequest = currentBooking.joinRequests.some(
        (r) => (r.user_iin === req.user?.iin || r.user_phone === req.user?.phone_number) && r.status === 'APPROVED'
      );

      // If already authorized host/guest/approved request, unlock door physically!
      if (isHost || isApprovedGuest || isApprovedJoinRequest) {
        // GPS Geolocation Check (Haversine Formula)
        const userLat = userLatitude !== undefined ? Number(userLatitude) : (user_latitude !== undefined ? Number(user_latitude) : ground.latitude);
        const userLon = userLongitude !== undefined ? Number(userLongitude) : (user_longitude !== undefined ? Number(user_longitude) : ground.longitude);

        const distanceMeters = calculateDistanceMeters(userLat, userLon, ground.latitude, ground.longitude);
        const allowedRadius = ground.allowed_radius_meters || 50;

        if (distanceMeters > allowedRadius) {
          return res.status(400).json({
            success: false,
            doorUnlocked: false,
            message: `Вы находитесь слишком далеко от площадки (расстояние ${Math.round(distanceMeters)}м, требуется находиться в пределах ${allowedRadius}м)`,
          });
        }

        const gateway = ground.gateways[0];
        const isGatewayOnline = gateway ? gateway.status === 'online' : true;
        const unlockResult = await TTLockService.unlockLock(ground.ttlock_lock_id, isGatewayOnline);

        await prisma.lockLog.create({
          data: {
            booking_id: currentBooking.id,
            user_id: req.user.id,
            ground_id: ground.id,
            method: 'qr_scan_authorized',
            unlock_type: unlockResult.mode,
            success: unlockResult.success,
            details: unlockResult.message,
          },
        });

        // Mark booking as door opened
        await prisma.booking.update({
          where: { id: currentBooking.id },
          data: { is_door_opened: true },
        });

        return res.json({
          success: unlockResult.success,
          doorUnlocked: true,
          message: unlockResult.message,
          data: unlockResult,
        });
      }

      // If NOT authorized: create or check spontaneous join request PENDING_SPONTANEOUS
      const totalCount = 1 + currentBooking.guests.length;
      if (totalCount >= 15) {
        return res.status(400).json({
          success: false,
          message: 'Все места на этот сеанс заполнены. Доступ запрещен.',
        });
      }

      let existingReq = currentBooking.joinRequests.find(
        (r) => r.user_iin === req.user?.iin || r.user_phone === req.user?.phone_number
      );

      if (!existingReq) {
        existingReq = await prisma.joinRequest.create({
          data: {
            booking_id: currentBooking.id,
            user_iin: req.user.iin,
            user_name: req.user.full_name,
            user_phone: req.user.phone_number,
            status: 'PENDING_SPONTANEOUS',
          },
        });
      }

      return res.json({
        success: false,
        doorUnlocked: false,
        message: 'Запрос на вход отправлен хозяину слота. Ожидайте подтверждения',
        data: existingReq,
      });
    } catch (error: any) {
      console.error('[LocksController.unlockByDoorQr]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
