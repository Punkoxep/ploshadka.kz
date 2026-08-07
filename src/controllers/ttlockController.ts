import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { TTLockService } from '../services/ttlockService';
import { Logger } from '../utils/logger';

export class TTLockController {
  /**
   * Webhook Callback Endpoint for TTLock Cloud API notifications.
   * Handles incoming lock events, unlock notifications, gateway status updates, and passcode entries.
   * Path: POST /api/v1/ttlock/callback
   */
  public static async handleCallback(req: Request, res: Response) {
    try {
      const payload = req.body || {};
      Logger.info(`[TTLock Webhook Callback] Notification received`, payload);

      const lockId = payload.lockId || payload.lock_id;
      const eventType = payload.records ? 'lock_record' : payload.status ? 'gateway_status' : 'general_notification';

      // Auto-confirm presence for active booking on this ground (No-Show check)
      await TTLockService.processCallbackUnlockRecord(payload);

      // Log unlock/lock activity to database audit log if lockId is present
      if (lockId) {
        try {
          const ground = await prisma.ground.findFirst({
            where: { ttlock_lock_id: String(lockId) },
          });

          if (ground) {
            await prisma.lockLog.create({
              data: {
                ground_id: ground.id,
                user_id: ground.id,
                method: 'qr_code',
                unlock_type: 'online_cloud',
                success: true,
                details: `TTLock Callback Event (${eventType}): ${JSON.stringify(payload)}`,
              },
            });
          }
        } catch (dbErr: any) {
          Logger.warn(`Optional DB log error in Webhook Callback`, dbErr.message);
        }
      }

      // TTLock Cloud OpenAPI expects HTTP 200 OK with text response "success"
      return res.status(200).send('success');
    } catch (error: any) {
      Logger.error(`Error processing Webhook callback`, error);
      return res.status(200).send('success');
    }
  }
}
