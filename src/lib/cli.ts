import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/guard";
import { revalidatePath } from "next/cache";
import { rankForScore } from "@/lib/ranks";
import { revalidatePublicPaths } from "@/lib/revalidate";
import { MCP_SERVER_VERSION } from "@/lib/mcp/schemas";
import {
  getSiteConfigMap,
  saveSiteConfigEntries,
  SCHEMA_BY_KEY,
  coerceConfigValue,
  getFlags,
} from "@/lib/site-config";
import { dbHealth, dbStats, cairoDayKey } from "@/lib/system";

/**
 * ============================================================
 * محرك تفسير أوامر التيرمينال السيادي — CLI Command Parser Engine
 * ============================================================
 * محرك واحد يخدم قناتين: نافذة التيرمينال داخل لوحة التحكم،
 * وأداة admin_cli في خادم MCP (Gemini Spark). كل أمر مُتحمّل
 * بالصلاحية الإدارية الصارمة عند الاستدعاء، وكل فعل مُغيِّر
 * يُوثَّق في سجل التدقيق AuditLog.
 */

export type CliLineType = "cmd" | "info" | "ok" | "warn" | "error" | "muted";
export type CliLine = { type: CliLineType; text: string };

export type CliContext = { adminUsername: string; adminId: string; ip: string; source: "web" | "mcp" };

const HELP_LINES: CliLine[] = [
  { type: "info", text: "قائمة الأوامر السيادية المتاحة:" },
  { type: "muted", text: "  sys info                    — نبض النظام: الإصدار، البيئة، زمن استجابة Neon، الحالة" },
  { type: "muted", text: "  cache purge [all | <path>]  — إفراغ كاش الصفحات فورًا (all افتراضيًا)" },
  { type: "muted", text: "  user inspect <email | id>   — السجل الأمني الكامل ونقاط الأثر والجلسات" },
  { type: "muted", text: "  user ban <email> [سبب]      — تعطيل حساب القارئ فورًا" },
  { type: "muted", text: "  user unban <email>          — تفعيل الحساب من جديد" },
  { type: "muted", text: "  config list                 — عرض كل مفاتيح التكوين السيادي وقيمها" },
  { type: "muted", text: "  config get <key>            — قراءة قيمة مفتاح محدد" },
  { type: "muted", text: "  config set <key> <value>    — تعديل أي إعداد وتطبيقه لحظيًا دون نشر" },
  { type: "muted", text: "  db stats                    — جداول القاعدة وسجلاتها وأحجامها" },
  { type: "muted", text: "  traffic tail [n]            — آخر n حركة خادم حية (افتراضي 15)" },
  { type: "muted", text: "  errors tail [n]             — آخر n خطأ تشغيلي مع بصمته" },
  { type: "muted", text: "  help                        — هذه القائمة" },
  { type: "muted", text: "  clear                       — تنظيف الشاشة (محلي)" },
];

function bytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function resolveUser(query: string) {
  const isEmail = query.includes("@");
  return isEmail
    ? prisma.user.findUnique({ where: { email: query } })
    : prisma.user.findUnique({ where: { id: query } });
}

/* ==================== المنفذون ==================== */

async function cmdSysInfo(): Promise<CliLine[]> {
  const health = await dbHealth();
  const flags = await getFlags();
  const map = await getSiteConfigMap();
  const mem = process.memoryUsage();
  const up = process.uptime();
  const lines: CliLine[] = [
    { type: "ok", text: `«كلام له لازمة» — النظام السيادي v${MCP_SERVER_VERSION}` },
    { type: "info", text: `البيئة: ${process.env.NODE_ENV ?? "unknown"} | المنطقة: ${process.env.VERCEL_REGION ?? "local"} | Node: ${process.version}` },
    { type: "info", text: `زمن تشغيل العملية: ${Math.floor(up / 3600)}س ${Math.floor((up % 3600) / 60)}د | الذاكرة: ${bytes(mem.rss)}` },
    {
      type: health.latencyMs < 200 ? "ok" : health.latencyMs < 800 ? "warn" : "error",
      text: `Neon DB: استجابة ${health.latencyMs}ms | اتصالات نشطة ${health.activeConnections}/${health.maxConnections} | الحجم ${bytes(health.sizeBytes)}`,
    },
    { type: "info", text: `مفاتيح التكوين المعتمدة: ${Object.keys(map).length} | مفاتيح الميزات: ${Object.values(flags).filter(Boolean).length}/${Object.keys(flags).length} مفعّلة` },
    { type: "info", text: `يوم القاهرة الحالي للعدادات: ${cairoDayKey()}` },
  ];
  return lines;
}

async function cmdCachePurge(target?: string): Promise<CliLine[]> {
  if (!target || target === "all") {
    revalidatePath("/", "layout");
    const { revalidateTag } = await import("next/cache");
    revalidateTag("site-config");
    await revalidatePublicPaths(["/"], undefined, true);
    return [{ type: "ok", text: "أُفرغ الكاش الشامل: كل صفحات المنصة العامة والتكوين السيادي انعكسا لحظيًا" }];
  }
  revalidatePath(target);
  await revalidatePublicPaths([target]);
  return [{ type: "ok", text: `أُفرغ كاش المسار «${target}» على المنصة العامة فورًا` }];
}

async function cmdUserInspect(query: string): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  const [impactLogs, loginLogs, sessionCount, commentCount] = await Promise.all([
    prisma.impactLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.loginLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.session.count({ where: { userId: user.id } }).catch(() => 0),
    prisma.comment.count({ where: { userId: user.id } }),
  ]);
  const lines: CliLine[] = [
    { type: "info", text: `القارئ: ${user.customName ?? user.name ?? "—"} <${user.email ?? "—"}>` },
    { type: "info", text: `id: ${user.id} | انضم: ${user.createdAt.toISOString().slice(0, 10)} | تعليقات: ${commentCount}` },
    { type: user.banned ? "error" : "ok", text: `الحالة: ${user.banned ? `محظور — السبب: ${user.banReason ?? "غير موثق"}` : "نشط"} | الجلسات: ${sessionCount}` },
    { type: "info", text: `رصيد الأثر: ${user.impactScore} نقطة | الرتبة: ${user.intellectualRank} (المستحقة آليًا: ${rankForScore(user.impactScore)})` },
  ];
  if (impactLogs.length) {
    lines.push({ type: "muted", text: "آخر حركات الأثر:" });
    for (const l of impactLogs)
      lines.push({ type: "muted", text: `  ${l.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${l.actionType}  ${l.points > 0 ? "+" : ""}${l.points}${l.reason ? ` — ${l.reason}` : ""}` });
  }
  if (loginLogs.length) {
    lines.push({ type: "muted", text: "آخر دخولات:" });
    for (const l of loginLogs)
      lines.push({ type: "muted", text: `  ${l.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${l.deviceType ?? "?"}/${l.browser ?? "?"}  ${l.city ?? ""}${l.country ? `, ${l.country}` : ""}  ${l.isNewDevice ? "جهاز جديد!" : ""}` });
  }
  return lines;
}

async function cmdUserBan(query: string, reason: string | undefined, ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  const banReason = reason?.trim() || "حظر إداري عبر التيرمينال السيادي";
  await prisma.user.update({ where: { id: user.id }, data: { banned: true, banReason } });
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.user_ban",
    entity: "User",
    entityId: user.id,
    meta: { email: user.email, reason: banReason, source: ctx.source },
    ip: ctx.ip,
  });
  return [{ type: "ok", text: `عُطّل حساب ${user.email ?? user.id} فورًا — السبب: ${banReason}` }];
}

async function cmdUserUnban(query: string, ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  await prisma.user.update({ where: { id: user.id }, data: { banned: false, banReason: null } });
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.user_unban",
    entity: "User",
    entityId: user.id,
    meta: { email: user.email, source: ctx.source },
    ip: ctx.ip,
  });
  return [{ type: "ok", text: `أُعيد تفعيل حساب ${user.email ?? user.id} فورًا` }];
}

async function cmdConfigSet(key: string, value: string, ctx: CliContext): Promise<CliLine[]> {
  const def = SCHEMA_BY_KEY.get(key);
  if (!def) return [{ type: "error", text: `مفتاح غير معروف: ${key} — استعرض المفاتيح بأمر config list` }];
  let coerced: unknown;
  try {
    coerced = coerceConfigValue(def, value);
  } catch (e) {
    return [{ type: "error", text: e instanceof Error ? e.message : "قيمة غير صالحة" }];
  }
  await saveSiteConfigEntries([{ key, value: coerced }], `cli:${ctx.adminUsername}`);
  const { revalidateTag } = await import("next/cache");
  revalidateTag("site-config");
  revalidatePath("/", "layout");
  await revalidatePublicPaths(["/"], undefined, true);
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.config_set",
    entity: "SiteConfig",
    entityId: key,
    meta: { value: coerced, source: ctx.source },
    ip: ctx.ip,
  });
  return [
    { type: "ok", text: `سُيّس المفتاح ${key} = ${JSON.stringify(coerced)} وطبّق لحظيًا دون إعادة نشر` },
    { type: "muted", text: `(التصنيف: ${def.category} — ${def.label})` },
  ];
}

async function cmdConfigGet(key: string): Promise<CliLine[]> {
  const map = await getSiteConfigMap();
  if (!(key in map)) return [{ type: "error", text: `مفتاح غير معروف: ${key}` }];
  const def = SCHEMA_BY_KEY.get(key);
  return [
    { type: "info", text: `${key} = ${JSON.stringify(map[key])}` },
    ...(def ? [{ type: "muted" as const, text: `(النوع: ${def.type} — ${def.label})` }] : []),
  ];
}

async function cmdConfigList(): Promise<CliLine[]> {
  const map = await getSiteConfigMap();
  return Object.entries(map).map(([k, v]) => ({
    type: "muted" as const,
    text: `  ${k.padEnd(28, " ")} = ${JSON.stringify(v)}`,
  }));
}

async function cmdDbStats(): Promise<CliLine[]> {
  const stats = await dbStats();
  const lines: CliLine[] = [
    { type: "info", text: `Neon DB — الحجم الكلي ${bytes(stats.totalSizeBytes)} | جداول مرصودة: ${stats.tables.length}` },
  ];
  for (const t of stats.tables.slice(0, 14))
    lines.push({ type: "muted", text: `  ${t.name.padEnd(24, " ")} ~${String(t.liveRows).padStart(7, " ")} صف  ${bytes(t.bytes).padStart(10, " ")}` });
  lines.push({ type: "info", text: `عدّات دقيقة: ${Object.entries(stats.exactCounts).map(([k, v]) => `${k}=${v}`).join(" | ")}` });
  return lines;
}

async function cmdTrafficTail(n: number): Promise<CliLine[]> {
  const rows = await prisma.requestLog.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Math.max(n, 1), 60) });
  if (!rows.length) return [{ type: "muted", text: "لا حركة مرصودة بعد — الوسيط يبني السجل لحظة بلحظة" }];
  return rows.map((r) => ({
    type: (r.isError ? "error" : "muted") as CliLineType,
    text: `${r.createdAt.toISOString().slice(11, 19)}  ${(r.method ?? "?").padEnd(5)} ${String(r.status ?? "—").padEnd(4)} ${(r.path ?? "").slice(0, 42).padEnd(44)} ${r.device ?? "?"} ${r.ip ?? ""}${r.userEmail ? ` ${r.userEmail}` : ""}`,
  }));
}

async function cmdErrorsTail(n: number): Promise<CliLine[]> {
  const rows = await prisma.serverErrorLog.findMany({ orderBy: { lastSeenAt: "desc" }, take: Math.min(Math.max(n, 1), 40) });
  if (!rows.length) return [{ type: "ok", text: "صفر أخطاء تشغيلية — النظام صافٍ" }];
  return rows.map((r) => ({
    type: "error" as const,
    text: `${r.lastSeenAt.toISOString().slice(11, 19)} ×${r.count} [${r.app}] ${(r.path ?? "?").slice(0, 40)} — ${r.message.slice(0, 110)}`,
  }));
}

/* ==================== المحلل الرئيسي ==================== */

export async function runCliCommand(raw: string, ctx: CliContext): Promise<CliLine[]> {
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) return [{ type: "muted", text: "اكتب أمرًا — جرّب help لعرض القائمة" }];

  const [head, ...rest] = input.split(" ");
  const cmd = head.toLowerCase();

  try {
    switch (cmd) {
      case "help":
      case "?":
        return HELP_LINES;

      case "sys":
      case "sysinfo": {
        const sub = (rest[0] ?? "info").toLowerCase();
        if (sub !== "info") return [{ type: "error", text: `أمر sys غير معروف: sys ${sub} — المتاح: sys info` }];
        return cmdSysInfo();
      }

      case "cache": {
        const [sub, ...pathParts] = rest;
        if ((sub ?? "").toLowerCase() !== "purge")
          return [{ type: "error", text: "الصيغة: cache purge [all | <path>]" }];
        return cmdCachePurge(pathParts.join(" ") || "all");
      }

      case "user": {
        const [sub, target, ...reasonParts] = rest;
        if (!target && sub !== "help")
          return [{ type: "error", text: "الصيغة: user inspect <email|id> | user ban <email> [سبب] | user unban <email>" }];
        switch ((sub ?? "").toLowerCase()) {
          case "inspect":
            return cmdUserInspect(target);
          case "ban":
            return cmdUserBan(target, reasonParts.join(" ") || undefined, ctx);
          case "unban":
            return cmdUserUnban(target, ctx);
          default:
            return [{ type: "error", text: `أمر user غير معروف: user ${sub}` }];
        }
      }

      case "config": {
        const [sub, key, ...valueParts] = rest;
        switch ((sub ?? "").toLowerCase()) {
          case "list":
            return cmdConfigList();
          case "get":
            if (!key) return [{ type: "error", text: "الصيغة: config get <key>" }];
            return cmdConfigGet(key);
          case "set": {
            if (!key || valueParts.length === 0)
              return [{ type: "error", text: "الصيغة: config set <key> <value>" }];
            return cmdConfigSet(key, valueParts.join(" "), ctx);
          }
          default:
            return [{ type: "error", text: "الصيغة: config list | config get <key> | config set <key> <value>" }];
        }
      }

      case "db": {
        const sub = (rest[0] ?? "stats").toLowerCase();
        if (sub !== "stats") return [{ type: "error", text: "الصيغة: db stats" }];
        return cmdDbStats();
      }

      case "traffic": {
        const sub = (rest[0] ?? "tail").toLowerCase();
        if (sub !== "tail") return [{ type: "error", text: "الصيغة: traffic tail [n]" }];
        return cmdTrafficTail(Number(rest[1]) || 15);
      }

      case "errors": {
        const sub = (rest[0] ?? "tail").toLowerCase();
        if (sub !== "tail") return [{ type: "error", text: "الصيغة: errors tail [n]" }];
        return cmdErrorsTail(Number(rest[1]) || 10);
      }

      case "clear":
        return [{ type: "info", text: "المسح يتم محليًا في الواجهة" }];

      default:
        return [
          { type: "error", text: `أمر غير معروف: ${cmd}` },
          { type: "muted", text: "جرّب help لعرض قائمة الأوامر السيادية" },
        ];
    }
  } catch (err) {
    return [
      { type: "error", text: `تعذر تنفيذ الأمر: ${err instanceof Error ? err.message : "خطأ داخلي"}` },
    ];
  }
}
