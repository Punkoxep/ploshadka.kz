import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { v4 as uuidv4 } from 'uuid';

export class GroundsController {
  /**
   * Get all sports grounds with associated gateways
   */
  public static async getAllGrounds(req: Request, res: Response) {
    try {
      const grounds = await prisma.ground.findMany({
        include: {
          gateways: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return res.json({
        success: true,
        data: grounds,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get ground information & current active session by static door QR token
   */
  public static async getGroundByQrToken(req: Request, res: Response) {
    try {
      const { qr_code_token } = req.params;

      const ground = await prisma.ground.findUnique({
        where: { qr_code_token },
        include: {
          gateways: true,
        },
      });

      if (!ground) {
        return res.status(404).json({
          success: false,
          message: 'Площадка с таким QR-кодом не найдена',
        });
      }

      // Check if there is an active session right now
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      // Find active booking for this ground
      const activeBookings = await prisma.booking.findMany({
        where: {
          ground_id: ground.id,
          booking_date: currentDateStr,
          status: 'confirmed',
        },
        include: {
          host_user: {
            select: { id: true, full_name: true, phone_number: true },
          },
          guests: {
            include: {
              user: {
                select: { id: true, full_name: true, phone_number: true },
              },
            },
          },
        },
      });

      // Filter active booking by time range
      const currentActiveBooking = activeBookings.find(
        (b) => currentTimeStr >= b.start_time && currentTimeStr <= b.end_time
      );

      const totalParticipants = currentActiveBooking
        ? 1 + currentActiveBooking.guests.length // Host + Guests
        : 0;

      return res.json({
        success: true,
        data: {
          ground,
          hasActiveSession: !!currentActiveBooking,
          activeBooking: currentActiveBooking
            ? {
                id: currentActiveBooking.id,
                host: currentActiveBooking.host_user,
                start_time: currentActiveBooking.start_time,
                end_time: currentActiveBooking.end_time,
                totalParticipants,
                availableSlots: Math.max(0, 15 - totalParticipants),
                guests: currentActiveBooking.guests,
              }
            : null,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create a new sports ground (Admin)
   */
  public static async createGround(req: Request, res: Response) {
    try {
      const { name, type, address, operating_schedule, cost_per_hour, latitude, longitude, allowed_radius_meters, ttlock_lock_id, ttlock_mac_address, isSchoolCourt, is_school_court, schoolHoursStart, school_hours_start, schoolHoursEnd, school_hours_end, schoolDays, school_days } = req.body;

      if (!name || !address) {
        return res.status(400).json({
          success: false,
          message: 'Заполните обязательные поля: название и адрес площадки',
        });
      }

      const uid = uuidv4().substring(0, 8).toUpperCase();
      const sportType = (type || 'football').toLowerCase();
      const qr_code_token = `QR_${sportType.toUpperCase()}_${uid}`;
      const lockId = ttlock_lock_id || `LOCK_${sportType.toUpperCase()}_${uid}`;

      const ground = await prisma.ground.create({
        data: {
          name,
          type: sportType,
          address,
          operating_schedule: operating_schedule || '08:00 - 23:00',
          cost_per_hour: parseFloat(cost_per_hour || 2000),
          latitude: latitude !== undefined ? parseFloat(latitude) : 43.238949,
          longitude: longitude !== undefined ? parseFloat(longitude) : 76.889709,
          allowed_radius_meters: allowed_radius_meters !== undefined ? parseInt(allowed_radius_meters) : 50,
          qr_code_token,
          ttlock_lock_id: lockId,
          ttlock_mac_address: ttlock_mac_address || `C4:4E:AC:${uid.substring(0, 2)}:${uid.substring(2, 4)}:${uid.substring(4, 6)}`,
          is_school_court: isSchoolCourt !== undefined ? Boolean(isSchoolCourt) : (is_school_court !== undefined ? Boolean(is_school_court) : true),
          school_hours_start: schoolHoursStart || school_hours_start || '08:00',
          school_hours_end: schoolHoursEnd || school_hours_end || '15:00',
          school_days: schoolDays || school_days || 'MON_FRI',
        },
      });

      // Auto-create default TTLock Gateway for the new ground
      await prisma.gateway.create({
        data: {
          ground_id: ground.id,
          gateway_name: `TTLock Gateway (${name})`,
          ttlock_gateway_id: `GW_${uid}`,
          status: 'online',
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Площадка успешно создана с уникальным токеном QR-кода и Wi-Fi шлюзом TTLock',
        data: ground,
      });
    } catch (error: any) {
      console.error('[GroundsController.createGround]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update existing sports ground / court (Admin)
   * Supports updating name, address, type, cost_per_hour / pricePerHour, latitude, longitude, allowed_radius_meters, isSchoolCourt, schoolHoursStart, schoolHoursEnd, schoolDays
   */
  public static async updateGround(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, address, type, cost_per_hour, pricePerHour, latitude, longitude, allowed_radius_meters, isSchoolCourt, is_school_court, schoolHoursStart, school_hours_start, schoolHoursEnd, school_hours_end, schoolDays, school_days } = req.body;

      const ground = await prisma.ground.findUnique({ where: { id } });
      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      // Handle 0 ₸ price correctly (pricePerHour or cost_per_hour)
      let targetCost = ground.cost_per_hour;
      if (pricePerHour !== undefined && pricePerHour !== null && pricePerHour !== '') {
        targetCost = parseFloat(pricePerHour);
      } else if (cost_per_hour !== undefined && cost_per_hour !== null && cost_per_hour !== '') {
        targetCost = parseFloat(cost_per_hour);
      }

      const schoolCourtFlag = isSchoolCourt !== undefined ? Boolean(isSchoolCourt) : (is_school_court !== undefined ? Boolean(is_school_court) : ground.is_school_court);

      const updated = await prisma.ground.update({
        where: { id },
        data: {
          name: name ? name.trim() : ground.name,
          address: address ? address.trim() : ground.address,
          type: type ? type.toLowerCase() : ground.type,
          cost_per_hour: !isNaN(targetCost) ? targetCost : ground.cost_per_hour,
          latitude: latitude !== undefined && latitude !== '' ? parseFloat(latitude) : ground.latitude,
          longitude: longitude !== undefined && longitude !== '' ? parseFloat(longitude) : ground.longitude,
          allowed_radius_meters: allowed_radius_meters !== undefined && allowed_radius_meters !== '' ? parseInt(allowed_radius_meters) : ground.allowed_radius_meters,
          is_school_court: schoolCourtFlag,
          school_hours_start: schoolHoursStart || school_hours_start || ground.school_hours_start,
          school_hours_end: schoolHoursEnd || school_hours_end || ground.school_hours_end,
          school_days: schoolDays || school_days || ground.school_days,
        },
      });

      return res.json({
        success: true,
        message: 'Данные площадки успешно обновлены',
        data: updated,
      });
    } catch (error: any) {
      console.error('[GroundsController.updateGround]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
