import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  signScopedToken,
  verifyScopedToken,
  type SessionPayload,
} from "@/lib/jwt";
import { hashToken } from "@/lib/crypto";

/**
 * إدارة الجلسات — JWT في كوكيز محصنة
 * (HttpOnly + Secure + SameSite=Strict) مرتبطة بسجل في قاعدة البيانات
 * يسمح بالإبطال الفوري من صفحة الأمان
 */

const SESSION_TTL_SEC = 60 * 60 * 8; // 8 ساعات
const TRUSTED_TTL_SEC = 60 * 60 * 24 * 30; // 30 يومًا للأجهزة الموثوقة

function cookieBase(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export async function createSession(opts: {
  adminId: string;
  username: string;
  ip?: string | null;
  userAgent?: string | null;
  deviceHash?: string | null;
  trusted?: boolean;
}): Promise<void> {
  const ttl = opts.trusted ? TRUSTED_TTL_SEC : SESSION_TTL_SEC;
  const { token, jti } = await signScopedToken(
    { sub: opts.adminId, username: opts.username },
    "session",
    ttl,
  );

  await prisma.adminSession.create({
    data: {
      adminId: opts.adminId,
      tokenHash: hashToken(jti),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 500) ?? null,
      deviceHash: opts.deviceHash ?? null,
      trusted: Boolean(opts.trusted),
      expiresAt: new Date(Date.now() + ttl * 1000),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieBase(ttl));
}

/** التحقق الكامل: توقيع JWT + سجل حي في قاعدة البيانات + غير منتهي */
export async function getSession(): Promise<{
  payload: SessionPayload;
  adminId: string;
  username: string;
} | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyScopedToken(token, "session");
  if (!payload) return null;

  const row = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(payload.jti) },
    select: { expiresAt: true },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;

  return { payload, adminId: payload.sub, username: payload.username };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifyScopedToken(token, "session");
    if (payload) {
      await prisma.adminSession
        .deleteMany({ where: { tokenHash: hashToken(payload.jti) } })
        .catch(() => {});
    }
  }
  store.delete(SESSION_COOKIE);
}

/** إبطال كل الجلسات الأخرى (يُستدعى بعد تغيير كلمة المرور) */
export async function revokeOtherSessions(adminId: string, keepJti?: string): Promise<void> {
  const sessions = await prisma.adminSession.findMany({
    where: { adminId, expiresAt: { gt: new Date() } },
    select: { id: true, tokenHash: true },
  });
  for (const s of sessions) {
    // نحفظ الجلسة الحالية فقط
    if (keepJti && s.tokenHash === hashToken(keepJti)) continue;
    await prisma.adminSession.delete({ where: { id: s.id } }).catch(() => {});
  }
}
