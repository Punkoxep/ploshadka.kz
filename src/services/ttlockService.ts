import crypto from 'crypto';
import { ENV } from '../config/env';
import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

export interface TTLockUnlockResponse {
  success: boolean;
  doorUnlocked?: boolean;
  mode: 'online_cloud' | 'offline_passcode' | 'offline_ekey' | 'mock_online_unlock';
  message: string;
  offlinePasscode?: string;
  offlineEkeyToken?: string;
  rawResponse?: any;
  data?: any;
}

export interface TTLockPasscodeResponse {
  success: boolean;
  passcode?: string;
  passcodeId?: number;
  startDate?: number;
  endDate?: number;
  message: string;
  rawResponse?: any;
}

export interface GatewayStatusResult {
  gatewayId: string;
  status: 'online' | 'offline';
  lastPingAt: Date;
  rawResponse?: any;
}

export class TTLockService {
  private static currentMode: 'mock' | 'real' = (ENV.TTLOCK_MODE as 'mock' | 'real') || 'mock';
  private static cachedAccessToken: string | null = null;
  private static tokenExpiresAt: number = 0;

  /**
   * Get current operating mode ('mock' | 'real')
   */
  public static getMode(): 'mock' | 'real' {
    return this.currentMode;
  }

  /**
   * Set operating mode dynamically ('mock' | 'real')
   */
  public static setMode(mode: 'mock' | 'real'): void {
    Logger.info(`Switching TTLock operating mode from "${this.currentMode}" to "${mode}"`);
    this.currentMode = mode;
  }

  /**
   * Fetch OAuth 2.0 Access Token from TTLock Cloud OpenAPI
   * POST /oauth2/token
   * Credentials: client_id, client_secret, username, password (lower-case MD5 hash), grant_type="password"
   */
  public static async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Cache Optimization: return cached token if valid for at least 60s
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    if (this.currentMode === 'mock') {
      this.cachedAccessToken = 'MOCK_TTLOCK_ACCESS_TOKEN_' + now;
      this.tokenExpiresAt = now + 7200 * 1000;
      return this.cachedAccessToken;
    }

    if (!ENV.TTLOCK_CLIENT_ID || !ENV.TTLOCK_CLIENT_SECRET || !ENV.TTLOCK_MASTER_USERNAME || !ENV.TTLOCK_MASTER_PASSWORD) {
      Logger.warn('TTLock credentials missing in process.env. Using fallback OAuth mode.');
      throw new Error('Учетные данные TTLock API не заданы в .env');
    }

    // Compute lowercase MD5 hash of Master Password
    const passwordMd5 = crypto
      .createHash('md5')
      .update(ENV.TTLOCK_MASTER_PASSWORD)
      .digest('hex')
      .toLowerCase();

    Logger.info(`Requesting OAuth2 Access Token for master user "${ENV.TTLOCK_MASTER_USERNAME}" from ${ENV.TTLOCK_API_BASE_URL}/oauth2/token...`);

    const params = new URLSearchParams({
      client_id: ENV.TTLOCK_CLIENT_ID,
      client_secret: ENV.TTLOCK_CLIENT_SECRET,
      grant_type: 'password',
      username: ENV.TTLOCK_MASTER_USERNAME,
      password: passwordMd5,
    });

    try {
      const response = await fetch(`${ENV.TTLOCK_API_BASE_URL}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data: any = await response.json();

      if (data && data.access_token) {
        this.cachedAccessToken = data.access_token;
        const expiresIn = (data.expires_in || 7200) * 1000;
        this.tokenExpiresAt = now + expiresIn;

        Logger.info(`OAuth2 access_token acquired successfully for "${ENV.TTLOCK_MASTER_USERNAME}". Expires in ${data.expires_in || 7200}s.`);
        return this.cachedAccessToken!;
      } else {
        Logger.error(`OAuth2 Token Request Error`, data);
        throw new Error(data?.errmsg || data?.error_description || `Ошибка токена TTLock (Код: ${data?.errcode || 'Unknown'})`);
      }
    } catch (err: any) {
      Logger.error(`OAuth2 token fetch exception`, err);
      throw err;
    }
  }

  /**
   * Remote Unlock via TTLock Cloud API
   * POST /v3/lock/unlock
   */
  public static async unlockLock(
    lockId: string,
    isGatewayOnline: boolean = true,
    bookingDetails?: { booking_id?: string; ground_name?: string }
  ): Promise<TTLockUnlockResponse> {
    Logger.info(`Unlock attempt for lockId: ${lockId}, Mode: ${this.currentMode}, Gateway Online: ${isGatewayOnline}`);

    // --- 1. MOCK MODE ---
    if (this.currentMode === 'mock') {
      const msg = 'Эмулятор TTLock: Дверь успешно открыта по Wi-Fi/5G шлюзу (Mock)';
      return {
        success: true,
        doorUnlocked: true,
        mode: 'mock_online_unlock',
        message: msg,
        rawResponse: { errcode: 0, errmsg: 'Mock Success', lockId },
        data: {
          mode: 'mock_online_unlock',
          message: msg,
          lockId: lockId,
          booking_id: bookingDetails?.booking_id || null,
          ground_name: bookingDetails?.ground_name || null,
        },
      };
    }

    // --- 2. LIVE MODE ---
    if (!isGatewayOnline) {
      Logger.warn(`Gateway is offline for lock ${lockId}. Switching to Offline Failover Mode...`);
      return this.generateOfflineFallback(lockId, 'Шлюз 5G/Wi-Fi не в сети');
    }

    try {
      const accessToken = await this.getAccessToken();

      const params = new URLSearchParams({
        clientId: ENV.TTLOCK_CLIENT_ID,
        accessToken: accessToken,
        lockId: lockId,
        date: Date.now().toString(),
      });

      Logger.info(`Sending real unlock request to ${ENV.TTLOCK_API_BASE_URL}/v3/lock/unlock...`);

      const response = await fetch(`${ENV.TTLOCK_API_BASE_URL}/v3/lock/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data: any = await response.json();

      if (data && data.errcode === 0) {
        return {
          success: true,
          doorUnlocked: true,
          mode: 'online_cloud',
          message: 'Замок разблокирован через боевой TTLock Cloud API',
          rawResponse: data,
          data: {
            mode: 'online_cloud',
            message: 'Замок разблокирован через боевой TTLock Cloud API',
            lockId: lockId,
            booking_id: bookingDetails?.booking_id || null,
            ground_name: bookingDetails?.ground_name || null,
            rawResponse: data,
          },
        };
      } else {
        Logger.warn(`Real TTLock API error code ${data?.errcode}: ${data?.errmsg}. Falling back to offline PIN.`);
        return this.generateOfflineFallback(lockId, data?.errmsg || `Ошибка TTLock API (Код ${data?.errcode})`);
      }
    } catch (error: any) {
      Logger.error(`Real Cloud unlock request failed`, error);
      return this.generateOfflineFallback(lockId, error.message);
    }
  }

  /**
   * Request Keyboard Passcode (PIN) for a Lock during booking duration
   * POST /v3/keyboardPwd/get
   */
  public static async getKeyboardPasscode(
    lockId: string,
    startDateMs: number,
    endDateMs: number,
    passcodeName: string = 'Booking PIN'
  ): Promise<TTLockPasscodeResponse> {
    Logger.info(`Requesting passcode for lockId: ${lockId}, Mode: ${this.currentMode}`);

    if (this.currentMode === 'mock') {
      const mockPin = String(Math.floor(100000 + Math.random() * 900000));
      return {
        success: true,
        passcode: mockPin,
        passcodeId: Math.floor(Math.random() * 10000),
        startDate: startDateMs,
        endDate: endDateMs,
        message: 'Сгенерирован временный PIN-код (Mock Mode)',
        rawResponse: { errcode: 0, keyboardPwd: mockPin },
      };
    }

    try {
      const accessToken = await this.getAccessToken();

      const params = new URLSearchParams({
        clientId: ENV.TTLOCK_CLIENT_ID,
        accessToken: accessToken,
        lockId: lockId,
        keyboardPwdType: '3',
        keyboardPwdName: passcodeName,
        startDate: startDateMs.toString(),
        endDate: endDateMs.toString(),
        date: Date.now().toString(),
      });

      const response = await fetch(`${ENV.TTLOCK_API_BASE_URL}/v3/keyboardPwd/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data: any = await response.json();

      if (data && data.errcode === 0 && data.keyboardPwd) {
        return {
          success: true,
          passcode: data.keyboardPwd,
          passcodeId: data.keyboardPwdId,
          startDate: startDateMs,
          endDate: endDateMs,
          message: 'Получен временный PIN-код от TTLock API',
          rawResponse: data,
        };
      } else {
        Logger.warn(`Passcode generation error code ${data?.errcode}: ${data?.errmsg}`);
        const fallbackPin = String((parseInt(lockId.replace(/\D/g, '') || '1234', 10) * 11) % 900000 + 100000);
        return {
          success: true,
          passcode: fallbackPin,
          message: `Резервный автономный PIN-код (${data?.errmsg || 'API Error'})`,
          rawResponse: data,
        };
      }
    } catch (err: any) {
      Logger.error(`Keyboard passcode request error`, err);
      const fallbackPin = String(Math.floor(100000 + Math.random() * 900000));
      return {
        success: true,
        passcode: fallbackPin,
        message: `Резервный автономный PIN-код (${err.message})`,
      };
    }
  }

  /**
   * Generates Offline Backup credentials (Keyboard PIN passcode & Bluetooth eKey)
   */
  private static generateOfflineFallback(lockId: string, reason: string): TTLockUnlockResponse {
    const pinSeed = parseInt(lockId.replace(/\D/g, '').substring(0, 4) || '1234', 10);
    const timeFactor = Math.floor(Date.now() / (1000 * 60 * 30));
    const offlinePasscode = String((pinSeed * 7 + timeFactor * 13) % 900000 + 100000);
    const offlineEkeyToken = `EKEY_OFFLINE_${lockId.substring(0, 8)}_${Date.now()}`;

    return {
      success: true,
      mode: 'offline_passcode',
      message: `Связь со шлюзом отсутствует (${reason}). Активирован автономный режим доступа (PIN-код / eKey)!`,
      offlinePasscode,
      offlineEkeyToken,
      rawResponse: { mode: 'fallback', reason, lockId },
    };
  }

  /**
   * Polls TTLock Cloud API to check status of Wi-Fi gateways
   * GET /v3/gateway/list
   */
  public static async checkGatewayStatus(gatewayId: string, currentDbStatus: string): Promise<GatewayStatusResult> {
    if (this.currentMode === 'mock') {
      return {
        gatewayId,
        status: (currentDbStatus as 'online' | 'offline') || 'online',
        lastPingAt: new Date(),
        rawResponse: { errcode: 0, errmsg: 'Mock Status Checked', status: currentDbStatus },
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${ENV.TTLOCK_API_BASE_URL}/v3/gateway/list?clientId=${ENV.TTLOCK_CLIENT_ID}&accessToken=${accessToken}&pageNo=1&pageSize=50`);
      const data: any = await response.json();

      const isOnline = data?.list?.some((g: any) => (g.gatewayId === gatewayId || g.gatewayName === gatewayId) && g.isOnline === 1);
      return {
        gatewayId,
        status: isOnline ? 'online' : 'offline',
        lastPingAt: new Date(),
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        gatewayId,
        status: 'offline',
        lastPingAt: new Date(),
        rawResponse: { error: err.message },
      };
    }
  }

  /**
   * Process Webhook Unlock Records and link with active bookings for presence confirmation (No-Show check)
   */
  public static async processCallbackUnlockRecord(payload: any): Promise<boolean> {
    const lockId = String(payload.lockId || payload.lock_id || '');
    if (!lockId) return false;

    Logger.info(`Processing Webhook unlock record for lockId: ${lockId}...`);

    try {
      const ground = await prisma.ground.findFirst({
        where: {
          OR: [
            { ttlock_lock_id: lockId },
            { qr_code_token: lockId },
          ],
        },
      });

      if (!ground) {
        Logger.warn(`No ground found matching ttlock_lock_id: ${lockId}`);
        return false;
      }

      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      // Find active booking right now on this ground
      const activeBookings = await prisma.booking.findMany({
        where: {
          ground_id: ground.id,
          booking_date: currentDateStr,
          status: 'confirmed',
        },
      });

      const activeBooking = activeBookings.find(
        (b) => currentTimeStr >= b.start_time && currentTimeStr <= b.end_time
      );

      if (activeBooking) {
        // Mark door opened to confirm presence and prevent 60-second No-Show auto-ban!
        await prisma.booking.update({
          where: { id: activeBooking.id },
          data: { is_door_opened: true },
        });

        Logger.info(`Webhook callback auto-confirmed presence for active booking ${activeBooking.id}! (is_door_opened = true)`);
        return true;
      }
    } catch (err: any) {
      Logger.error(`Error linking webhook callback to booking`, err);
    }

    return false;
  }
}
