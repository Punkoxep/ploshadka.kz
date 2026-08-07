/**
 * Structured Application Logger
 */
export class Logger {
  public static info(message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    if (meta !== undefined) {
      console.log(`[${timestamp}] [INFO] ${message}`, typeof meta === 'object' ? JSON.stringify(meta) : meta);
    } else {
      console.log(`[${timestamp}] [INFO] ${message}`);
    }
  }

  public static warn(message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    if (meta !== undefined) {
      console.warn(`[${timestamp}] [WARN] ⚠️ ${message}`, typeof meta === 'object' ? JSON.stringify(meta) : meta);
    } else {
      console.warn(`[${timestamp}] [WARN] ⚠️ ${message}`);
    }
  }

  public static error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    if (error !== undefined) {
      console.error(`[${timestamp}] [ERROR] ❌ ${message}`, error?.stack || error?.message || error);
    } else {
      console.error(`[${timestamp}] [ERROR] ❌ ${message}`);
    }
  }
}
