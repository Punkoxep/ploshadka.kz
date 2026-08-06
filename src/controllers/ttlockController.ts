import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { TTLockService } from '../services/ttlockService';

export class TTLockController {
  /**
   * Webhook Callback Endpoint for TTLock Cloud API notifications.
   * Handles incoming lock events, unlock notifications, gateway status updates, and passcode entries.
   * Path: POST /api/v1/ttlock/callback
   */
  public static async handleCallback(req: Request, res: Response) {
    try {
      const payload = req.body;
      const timestamp = new Date().toISOString();

      console.log(`=======================================================`);
      console.log(`🔔 [TTLock Webhook Callback] Received at ${timestamp}`);
      console.log(`Payload Body:`, JSON.stringify(payload, null, 2));
      console.log(`=======================================================`);

      // Extract details if present in standard TTLock webhook payload
      const lockId = payload.lockId || payload.lock_id;
      const gatewayId = payload.gatewayId || payload.gateway_id;
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
                user_id: ground.id, // Linked to ground System user for external callback events
                method: 'qr_code',
                unlock_type: 'online_cloud',
                success: true,
                details: `TTLock Callback Event (${eventType}): ${JSON.stringify(payload)}`,
              },
            });
          }
        } catch (dbErr: any) {
          console.warn(`[TTLockController] Optional DB log error: ${dbErr.message}`);
        }
      }

      // TTLock Cloud OpenAPI expects HTTP 200 OK with text response "success" or JSON success
      return res.status(200).send('success');
    } catch (error: any) {
      console.error(`[TTLockController.handleCallback] Error processing callback:`, error);
      // Always return 200 OK to prevent TTLock server from re-trying indefinitely on bad payload
      return res.status(200).send('success');
    }
  }
}
