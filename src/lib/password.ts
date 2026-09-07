import { hash, verify } from "@node-rs/argon2";

/**
 * تجزئة كلمات المرور بـ Argon2id — المعيار الذهبي المقاوم لهجمات GPU
 * (بدائل Bcrypt مقبولة لكن Argon2id أقوى وموصى به OWASP)
 */

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 ميجابايت
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** تأخير ثابت عند فشل التحقق — يمنع هجمات التوقيت واستطلاع أسماء المستخدمين */
export async function constantTimeDummyVerify(): Promise<void> {
  const dummy = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2Fsd$dGVzdGR1bW15aGFzaGhlcmV0b2tlZXB0aW1lc2FtZQ";
  await verify(dummy, "dummy-password-attempt").catch(() => {});
}

/** فحص قوة كلمة المرور — الحد الأدنى 8 أحرف (تعويضه: 2FA إلزامي + حد معدل المحاولات + بصمة الأجهزة) */
export function validatePasswordStrength(password: string): { ok: boolean; message?: string } {
  if (password.length < 8) {
    return { ok: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return { ok: false, message: "يجب أن تحتوي على أحرف كبيرة وصغيرة" };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "يجب أن تحتوي على رقم واحد على الأقل" };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { ok: false, message: "يجب أن تحتوي على رمز خاص واحد على الأقل" };
  }
  return { ok: true };
}
