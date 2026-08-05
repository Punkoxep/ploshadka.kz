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
      const { name, type, address, operating_schedule, cost_per_hour, ttlock_lock_id, ttlock_mac_address } = req.body;

      if (!name || !type || !address || !cost_per_hour || !ttlock_lock_id) {
        return res.status(400).json({
          success: false,
          message: 'Заполните обязательные поля: название, тип, адрес, стоимость, TTLock Lock ID',
        });
      }

      const qr_code_token = `QR_${type.toUpperCase()}_${uuidv4().substring(0, 8)}`;

      const ground = await prisma.ground.create({
        data: {
          name,
          type,
          address,
          operating_schedule: operating_schedule || '08:00 - 23:00',
          cost_per_hour: parseFloat(cost_per_hour),
          qr_code_token,
          ttlock_lock_id,
          ttlock_mac_address,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Площадка успешно создана с уникальным токеном дверного QR-кода',
        data: ground,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
