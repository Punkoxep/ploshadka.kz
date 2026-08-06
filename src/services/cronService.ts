import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { ENV } from '../config/env';
import { TTLockService } from './ttlockService';

export class CronService {
  public static initGatewayMonitoring() {
    const cronExpr = ENV.CRON_GATEWAY_MONITOR;
    console.log(`[CronService] Initializing Gateway Monitoring Cron Job with schedule: "${cronExpr}"`);

    cron.schedule(cronExpr, async () => {
      console.log(`[CronService] Executing periodic Wi-Fi Gateway health check...`);
      try {
        const gateways = await prisma.gateway.findMany();

        for (const gateway of gateways) {
          const checkResult = await TTLockService.checkGatewayStatus(gateway.ttlock_gateway_id, gateway.status);

          // Update Gateway in DB if status changed or ping timestamp
          await prisma.gateway.update({
            where: { id: gateway.id },
            data: {
              status: checkResult.status,
              last_ping_at: checkResult.lastPingAt,
            },
          });

          // Write log entry
          await prisma.gatewayStatusLog.create({
            data: {
              gateway_id: gateway.id,
              status: checkResult.status,
              response_raw: JSON.stringify(checkResult.rawResponse || {}),
              checked_at: checkResult.lastPingAt,
            },
          });

          console.log(`[CronService] Gateway "${gateway.gateway_name}" (${gateway.ttlock_gateway_id}): Status = ${checkResult.status}`);
        }
      } catch (error: any) {
        console.error(`[CronService] Error in Gateway Monitoring Cron Job:`, error);
      }
    });
  }

  public static initNoShowAutoCheck() {
    console.log('[CronService] Initializing Automated 60-second No-Show Auto-Ban Background Worker...');
    setInterval(async () => {
      try {
        const { BookingsController } = require('../controllers/bookingsController');
        await BookingsController.processNoShowAutoBans();
      } catch (error: any) {
        console.error('[CronService] Error in No-Show Background Worker:', error.message);
      }
    }, 60000);
  }
}
