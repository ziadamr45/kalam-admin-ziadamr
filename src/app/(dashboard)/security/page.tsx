import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/settings";
import { getSession } from "@/lib/session";
import { SecurityPanels } from "@/components/security-panels";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getSession();
  const [devices, rules, alerts, audit, settings, envState] = await Promise.all([
    prisma.trustedDevice.findMany({
      where: { adminId: session!.adminId },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.ipRule.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.securityAlert.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getSystemSettings(),
    Promise.resolve({
      enforceIpWhitelist: (process.env.ENFORCE_IP_WHITELIST || "false") === "true",
      blockUntrustedDevices: (process.env.BLOCK_UNTRUSTED_DEVICES || "false") === "true",
      envTrustedIps: (process.env.TRUSTED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean),
    }),
  ]);

  return (
    <SecurityPanels
      adminId={session!.adminId}
      devices={devices.map((d) => ({
        id: d.id,
        label: d.label || "جهاز",
        lastIp: d.lastIp || "—",
        lastSeenAt: d.lastSeenAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      }))}
      rules={rules.map((r) => ({
        id: r.id,
        ip: r.ip,
        mode: r.mode as "ALLOW" | "DENY",
        note: r.note,
      }))}
      alerts={alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        resolved: a.resolved,
        createdAt: a.createdAt.toISOString(),
      }))}
      audit={audit.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        ip: a.ip,
        createdAt: a.createdAt.toISOString(),
      }))}
      settings={settings}
      envState={envState}
    />
  );
}
