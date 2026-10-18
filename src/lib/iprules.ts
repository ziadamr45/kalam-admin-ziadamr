import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * قواعد IP: قائمة سماح/حظر مرنة تُدار من صفحة الأمان
 * + دعم قائمة بيئة ساكنة TRUSTED_IPS
 */

export type IpCheckResult = "allowed" | "denied" | "neutral";

export async function checkIpRules(ip: string): Promise<IpCheckResult> {
  if (!ip || ip === "unknown") return "neutral";

  try {
    const rule = await prisma.ipRule.findUnique({ where: { ip } });
    if (rule) return rule.mode === "ALLOW" ? "allowed" : "denied";
  } catch {}

  return "neutral";
}

export function getEnvTrustedIps(): string[] {
  return (process.env.TRUSTED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isEnvWhitelisted(ip: string): boolean {
  return getEnvTrustedIps().includes(ip);
}

/** قرار الوصول الكلي: env + قاعدة البيانات + مفتاح الفرض */
export async function decideIpAccess(ip: string): Promise<{
  access: boolean;
  reason: string;
}> {
  const envListed = isEnvWhitelisted(ip);
  if (envListed) return { access: true, reason: "قائمة البيئة" };

  const dbResult = await checkIpRules(ip);
  if (dbResult === "denied") return { access: false, reason: "قاعدة حظر صريحة" };
  if (dbResult === "allowed") return { access: true, reason: "قاعدة سماح" };

  const enforce = (process.env.ENFORCE_IP_WHITELIST || "false") === "true";
  if (enforce) {
    return { access: false, reason: "الفرض الصارم مفعّل و IP خارج القائمة" };
  }
  return { access: true, reason: "لا تقييد صارم" };
}
