import { authenticator } from "otplib";

/**
 * TOTP (Time-based One-Time Password) — متوافق مع Google Authenticator
 * و1Password وAuthy وجميع تطبيقات التوثيق العالمية
 */

authenticator.options = { window: [1, 1], step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUrl(secret: string, accountName: string): string {
  return authenticator.keyuri(accountName, "كلام له لازمة — لوحة التحكم", secret);
}

/** التحقق من الرمز السري المتغير اللحظي مع سماح ±30 ثانية انحراف */
export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    const clean = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return false;
    return authenticator.verify({ token: clean, secret });
  } catch {
    return false;
  }
}
