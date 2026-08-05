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
}
