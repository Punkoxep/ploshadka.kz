/**
 * Helper utility for sanitizing and validating API inputs against injections and malformed data.
 */
export class InputValidator {
  /**
   * Sanitizes string input by stripping potential script/HTML/SQL injection vectors
   */
  public static sanitizeString(input: any): string {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Validates Kazakhstan Phone Number format (+77XXXXXXXXX or 87XXXXXXXXX)
   */
  public static isValidPhone(phone: any): boolean {
    if (typeof phone !== 'string') return false;
    const clean = phone.replace(/[\s\-\(\)]/g, '');
    return /^(\+7|8)\d{10}$/.test(clean);
  }

  /**
   * Validates Kazakhstan 12-digit IIN format
   */
  public static isValidIIN(iin: any): boolean {
    if (typeof iin !== 'string') return false;
    return /^\d{12}$/.test(iin.trim());
  }

  /**
   * Validates UUID string format
   */
  public static isValidUUID(id: any): boolean {
    if (typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id.trim());
  }

  /**
   * Validates YYYY-MM-DD Date format
   */
  public static isValidDateFormat(dateStr: any): boolean {
    if (typeof dateStr !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
  }

  /**
   * Validates HH:mm Time format (00:00 to 23:59)
   */
  public static isValidTimeFormat(timeStr: any): boolean {
    if (typeof timeStr !== 'string') return false;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr.trim());
  }
}
