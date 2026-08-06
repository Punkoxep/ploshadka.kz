import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export class AdminController {
  /**
   * Get all Wi-Fi Gateways and health status
   */
  public static async getGatewayStatus(req: Request, res: Response) {
    try {
      const gateways = await prisma.gateway.findMany({
        include: {
          ground: { select: { id: true, name: true, type: true } },
          logs: {
            take: 10,
            orderBy: { checked_at: 'desc' },
          },
        },
      });

      return res.json({
        success: true,
        data: gateways,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Toggle Gateway status (online <-> offline) for local testing & failover verification
   */
  public static async toggleGatewayStatus(req: Request, res: Response) {
    try {
      const { gateway_id, status } = req.body;

      if (!gateway_id || !status || !['online', 'offline'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Укажите gateway_id и статус ("online" или "offline")' });
      }

      const updated = await prisma.gateway.update({
        where: { id: gateway_id },
        data: {
          status,
          last_ping_at: new Date(),
        },
      });

      // Log change
      await prisma.gatewayStatusLog.create({
        data: {
          gateway_id: updated.id,
          status: updated.status,
          response_raw: JSON.stringify({ manual_toggle: true }),
        },
      });

      return res.json({
        success: true,
        message: `Статус шлюза "${updated.gateway_name}" изменен на "${updated.status}"`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Lock Access Audit Logs
   */
  public static async getLockLogs(req: Request, res: Response) {
    try {
      const logs = await prisma.lockLog.findMany({
        include: {
          user: { select: { id: true, full_name: true, phone_number: true, iin: true } },
          ground: { select: { id: true, name: true } },
          booking: true,
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      });

      return res.json({
        success: true,
        data: logs,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Overall System Health & Monitoring Statistics
   */
  public static async getSystemStats(req: Request, res: Response) {
    try {
      const usersCount = await prisma.user.count();
      const groundsCount = await prisma.ground.count();
      const bookingsCount = await prisma.booking.count();
      const gatewaysCount = await prisma.gateway.count();
      const onlineGateways = await prisma.gateway.count({ where: { status: 'online' } });
      const offlineGateways = await prisma.gateway.count({ where: { status: 'offline' } });

      return res.json({
        success: true,
        data: {
          usersCount,
          groundsCount,
          bookingsCount,
          gatewaysCount,
          gatewaysHealth: {
            online: onlineGateways,
            offline: offlineGateways,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/admin/analytics/overview
   * General usage metrics across all sports grounds (excluding costs/financials)
   */
  public static async getAnalyticsOverview(req: Request, res: Response) {
    try {
      const groundsCount = await prisma.ground.count();
      const bookings = await prisma.booking.findMany({
        where: { status: 'confirmed' },
        include: {
          host_user: { select: { iin: true, full_name: true } },
          guests: { include: { user: { select: { iin: true, full_name: true } } } },
          joinRequests: { where: { status: 'APPROVED' } },
        },
      });

      const totalBookings = bookings.length;

      // Unique Players by IIN
      const uniqueIins = new Set<string>();
      let totalPlayersSum = 0;
      const hourlyDistribution: Record<string, number> = {};

      bookings.forEach((b) => {
        let bookingPlayers = 1; // Host
        if (b.host_user?.iin) uniqueIins.add(b.host_user.iin);

        if (b.guests) {
          b.guests.forEach((g) => {
            bookingPlayers++;
            if (g.user?.iin) uniqueIins.add(g.user.iin);
          });
        }

        if (b.joinRequests) {
          b.joinRequests.forEach((r) => {
            if (r.user_iin) uniqueIins.add(r.user_iin);
          });
        }

        totalPlayersSum += bookingPlayers;

        // Hour stats
        const startHour = b.start_time ? b.start_time.split(':')[0] + ':00' : '18:00';
        hourlyDistribution[startHour] = (hourlyDistribution[startHour] || 0) + 1;
      });

      const uniquePlayersCount = uniqueIins.size || (await prisma.user.count());
      const averageTeamSize = totalBookings > 0 ? Math.round((totalPlayersSum / totalBookings) * 10) / 10 : 0;

      // Find peak hour
      let mostPopularHour = '18:00 - 19:00';
      let maxHourCount = 0;
      Object.entries(hourlyDistribution).forEach(([hour, count]) => {
        if (count > maxHourCount) {
          maxHourCount = count;
          const nextH = String(parseInt(hour.split(':')[0]) + 1).padStart(2, '0') + ':00';
          mostPopularHour = `${hour} - ${nextH}`;
        }
      });

      // Calculate capacity / occupancy rate
      // Assuming 15 available hourly slots per day (08:00 to 23:00) per ground
      const totalAvailableSlots = Math.max(1, groundsCount * 15);
      const occupancyPercentage = Math.min(100, Math.round((totalBookings / totalAvailableSlots) * 100 * 10) / 10);

      return res.json({
        success: true,
        data: {
          groundsCount,
          totalBookings,
          uniquePlayersCount,
          occupancyPercentage,
          mostPopularHour,
          averageTeamSize,
        },
      });
    } catch (error: any) {
      console.error('[AdminController.getAnalyticsOverview]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/admin/analytics/venues/:venueId/heatmap
   * Hourly loading distribution data (08:00 to 23:00) for a venue
   */
  public static async getVenueHeatmap(req: Request, res: Response) {
    try {
      const { venueId } = req.params;

      const ground = await prisma.ground.findUnique({
        where: { id: venueId },
      });

      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      const bookings = await prisma.booking.findMany({
        where: { ground_id: venueId, status: 'confirmed' },
        include: { guests: true },
      });

      // Build 08:00 - 23:00 hourly slot matrix
      const hourlyMap: Record<string, { count: number; players: number }> = {};
      for (let h = 8; h <= 22; h++) {
        const hourStr = String(h).padStart(2, '0') + ':00';
        hourlyMap[hourStr] = { count: 0, players: 0 };
      }

      bookings.forEach((b) => {
        const startH = parseInt(b.start_time.split(':')[0]);
        const endH = parseInt(b.end_time.split(':')[0]);
        const players = 1 + b.guests.length;

        for (let h = startH; h < endH; h++) {
          const hourStr = String(h).padStart(2, '0') + ':00';
          if (hourlyMap[hourStr]) {
            hourlyMap[hourStr].count += 1;
            hourlyMap[hourStr].players += players;
          }
        }
      });

      const maxBookingsPerSlot = Math.max(1, bookings.length || 1);

      const hourlyMatrix = Object.entries(hourlyMap).map(([hour, info]) => {
        const endH = String(parseInt(hour.split(':')[0]) + 1).padStart(2, '0') + ':00';
        const occupancyPercent = Math.min(100, Math.round((info.count / maxBookingsPerSlot) * 100));
        let level: 'peak' | 'normal' | 'low' = 'low';
        if (occupancyPercent >= 70 || info.count >= 2) level = 'peak';
        else if (occupancyPercent >= 30 || info.count >= 1) level = 'normal';

        return {
          timeSlot: `${hour} - ${endH}`,
          startHour: hour,
          bookingsCount: info.count,
          totalPlayers: info.players,
          occupancyPercent,
          level,
        };
      });

      // Peak vs off-peak classification
      const peakHours = hourlyMatrix.filter((h) => h.level === 'peak').map((h) => h.timeSlot);
      const lowHours = hourlyMatrix.filter((h) => h.level === 'low').map((h) => h.timeSlot);

      return res.json({
        success: true,
        data: {
          ground: { id: ground.id, name: ground.name, type: ground.type },
          hourlyMatrix,
          peakHours: peakHours.length ? peakHours : ['18:00 - 19:00', '19:00 - 20:00', '20:00 - 21:00'],
          offPeakHours: lowHours.length ? lowHours : ['08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00'],
        },
      });
    } catch (error: any) {
      console.error('[AdminController.getVenueHeatmap]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/v1/admin/analytics/venues/:venueId/players
   * Unique players statistics (by IIN) and average team size for a venue
   */
  public static async getVenuePlayersAnalytics(req: Request, res: Response) {
    try {
      const { venueId } = req.params;

      const ground = await prisma.ground.findUnique({
        where: { id: venueId },
      });

      if (!ground) {
        return res.status(404).json({ success: false, message: 'Площадка не найдена' });
      }

      const bookings = await prisma.booking.findMany({
        where: { ground_id: venueId, status: 'confirmed' },
        include: {
          host_user: true,
          guests: { include: { user: true } },
          joinRequests: true,
        },
      });

      const playerMap = new Map<string, { iin: string; name: string; phone: string; gender: string; role: string; gamesCount: number }>();
      let totalPlayersSum = 0;

      bookings.forEach((b) => {
        let slotPlayers = 1;
        if (b.host_user) {
          const iin = b.host_user.iin;
          const existing = playerMap.get(iin) || { iin, name: b.host_user.full_name, phone: b.host_user.phone_number, gender: b.host_user.gender, role: 'Хозяин слота', gamesCount: 0 };
          existing.gamesCount += 1;
          playerMap.set(iin, existing);
        }

        b.guests.forEach((g) => {
          slotPlayers++;
          if (g.user) {
            const iin = g.user.iin;
            const existing = playerMap.get(iin) || { iin, name: g.user.full_name, phone: g.user.phone_number, gender: g.user.gender, role: 'Участник', gamesCount: 0 };
            existing.gamesCount += 1;
            playerMap.set(iin, existing);
          }
        });

        b.joinRequests.forEach((r) => {
          if (r.status === 'APPROVED' && r.user_iin) {
            const existing = playerMap.get(r.user_iin) || { iin: r.user_iin, name: r.user_name, phone: r.user_phone, gender: 'male', role: 'Одобренный гость', gamesCount: 0 };
            existing.gamesCount += 1;
            playerMap.set(r.user_iin, existing);
          }
        });

        totalPlayersSum += slotPlayers;
      });

      const uniquePlayersList = Array.from(playerMap.values());
      const uniquePlayersCount = uniquePlayersList.length;
      const averageTeamSize = bookings.length > 0 ? Math.round((totalPlayersSum / bookings.length) * 10) / 10 : 0;

      // Gender breakdown
      const maleCount = uniquePlayersList.filter((p) => p.gender === 'male').length;
      const femaleCount = uniquePlayersList.filter((p) => p.gender === 'female').length;

      return res.json({
        success: true,
        data: {
          ground: { id: ground.id, name: ground.name, type: ground.type },
          uniquePlayersCount,
          averageTeamSize,
          demographics: {
            maleCount,
            femaleCount,
          },
          playersList: uniquePlayersList,
        },
      });
    } catch (error: any) {
      console.error('[AdminController.getVenuePlayersAnalytics]', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

