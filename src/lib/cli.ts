import "server-only";
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
import { grantVip, revokeVip, grantVerification, revokeVerification, PRIVILEGE_KEYS, VERIFICATION_TYPES, GRANTABLE_VERIFICATION_TYPES, type VipPrivileges, type VerificationType, type GrantableRole, roleLabelAr, verificationSealLabel } from "@/lib/vip";
import { hardDeleteUser, isHardDeleteReason, hardDeleteReasonLabel, HARD_DELETE_REASONS } from "@/lib/hard-delete";
import { loadLedger, resolveLedgerRange, TRAIL_CATEGORIES, type TrailCategoryFilter } from "@/lib/audit-ledger";
import { buildAuditShareUrl } from "@/lib/audit-share";

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
  { type: "info", text: "قائمة الأوامر السيادية المتاحة — اكتب help <command> للشرح المفصل:" },
  { type: "muted", text: "  sys info | ping | env        — النظام: النبض، زمن استجابة Neon، تدقيق البيئة الصحي" },
  { type: "muted", text: "  cache purge [all|<path>] | purge-all — إفراغ الكاش الشامل أو لمسار محدد" },
  { type: "muted", text: "  user inspect <email|id>      — السجل الأمني الكامل ونقاط الأثر والجلسات" },
  { type: "muted", text: "  user grant-vip <email> --title \"..\" --color \"#..\" --points N --role R --unlimited-ai — العضوية المميزة" },
  { type: "muted", text: "  user verify <email> [--type OWNER|OFFICIAL_AUTHOR|FAMILY_CORE|NOTABLE] [--badge \"..\"] — التوثيق الرسمي" },
  { type: "muted", text: "  user unverify <email> [--reason \"..\"] — سحب التوثيق فقط (العضوية لا تُمس)" },
  { type: "muted", text: "  user ban <email> [سبب] | unban <email> — تعطيل/تفعيل الحساب" },
  { type: "muted", text: "  user hard-delete <email> --reason-code .. --reason \"..\" --evidence \"https://..\" — المحو السيادي الشامل الموثق بالدليل" },
  { type: "muted", text: "  audit list --days N [--category ..] | audit inspect <id> | audit export-pdf --range weekly|monthly — السجل السيادي والتقارير" },
  { type: "muted", text: "  article status <slug> | toggle-comments <slug> — إحصاءات المقال وباب التعليق" },
  { type: "muted", text: "  config list | get <key> | set <key> <value> — التكوين السيادي اللحظي" },
  { type: "muted", text: "  db stats | slow-queries      — القاعدة: الجداول والحجم والعمليات البطيئة" },
  { type: "muted", text: "  traffic tail [n] | errors tail [n] | security tail [n] — المراصد الحية" },
  { type: "muted", text: "  sec audit | block-ip <ip> | active-logins — الأمن: فحص الرؤوس، الحجب، الدخولات" },
  { type: "muted", text: "  spark exec \"<طلب بالطبيعي>\" — انطة طبيعية يحولها الذكاء السيادي لأمر وينفذه" },
  { type: "muted", text: "  notify send <email | all> --title \"..\" --body \"..\" [--channel push|email|inapp|all] — إرسال عبر المرسل المركزي" },
  { type: "muted", text: "  notify inspect <email> | notify purge-old --days N — تدقيق صندوق مستخدم / تنظيف المقروء القديم" },
  { type: "muted", text: "  help [command] | clear       — الدليل المفصل / تنظيف الشاشة" },
];

/* شرح مفصل لكل أمر — help <command> */
const HELP_TOPICS: Record<string, CliLine[]> = {
  sys: [
    { type: "info", text: "sys — أوامر النظام والخادم:" },
    { type: "muted", text: "  sys info   — إصدار المنصة، البيئة، المنطقة، الذاكرة، نبض Neon، حالة التكوين" },
    { type: "muted", text: "  sys ping   — ثلاث قياسات متتالية لزمن استجابة Neon مع المتوسط" },
    { type: "muted", text: "  sys env    — تدقيق صحي لمتغيرات البيئة: الموجود والناقص دون كشف أي قيمة" },
  ],
  user: [
    { type: "info", text: "user — إدارة المستخدمين والسيادة:" },
    { type: "muted", text: "  user inspect <email|id>    — سجل استخباري شامل: الرصيد، الشارة، الدخولات، الأثر" },
    { type: "muted", text: "  user grant-vip <email> --title \"كاتب ضيف\" --color \"#6B8E23\" [--role EDITOR] [--points 350] [--unlimited-ai]" },
    { type: "muted", text: "                             — العضوية المميزة المستقلة: كبسولة بلون وسبب إلزامي وصلاحيات ونقاط (بلا توثيق)" },
    { type: "muted", text: "  user vip-grant ...          — اسم بديل لنفس أمر العضوية المميزة" },
    { type: "muted", text: "  user set-points <email> <n> — تعديل الرصيد قيمة مطلقة (يُسجل الفرق في سجل الأثر)" },
    { type: "muted", text: "  user verify <email> --type NOTABLE --badge \"باحث معرفي\" — التوثيق الرسمي فقط (إثبات هوية بلا صلاحيات)" },
    { type: "muted", text: "  user unverify <email> --reason \"..\" — سحب التوثيق فقط، العضوية المميزة إن وُجدت لا تُمس" },
    { type: "muted", text: "  user ban <email> [سبب] | user unban <email> — الحظر والفك" },
    { type: "muted", text: "  user hard-delete <email> --reason-code OFFICIAL_USER_REQUEST|SEVERE_DIALOGUE_VIOLATION|SECURITY_ABUSE --reason \"تفصيل\" --evidence \"https://رابط-الدليل\"" },
    { type: "muted", text: "                             — المحو البرمجي الشامل: كل بيانات الحساب تُمحى نهائيًا، الدليل إلزامي، ويُودع قيد رقابي داخل المعاملة" },
    { type: "muted", text: "  أنواع التوثيق: OWNER (حصري بالبذر) | OFFICIAL_AUTHOR زيتي | FAMILY_CORE فيروزي | NOTABLE كحلي" },
  ],
  audit: [
    { type: "info", text: "audit — السجل السيادي (التدقيق والامتثال):" },
    { type: "muted", text: "  audit list --days 7 [--category USER_SELF_ACTION|ADMIN_MODERATION|ADMIN_VIP_CHANGE|SYSTEM_CONFIG_CHANGE]" },
    { type: "muted", text: "                — قيود الفترة + أرقام الملخص التنفيذي" },
    { type: "muted", text: "  audit inspect <auditId>  — القيد الكامل: الفاعل والدور والسبب والدليل والقيم التقنية (metadata)" },
    { type: "muted", text: "  audit export-pdf --range weekly|monthly --upload — توليد التقرير الرقابي الفاخر ورفعه في مجلد الأدلة وإرجاع رابط التنزيل" },
  ],
  article: [
    { type: "info", text: "article — عمليات المحتوى:" },
    { type: "muted", text: "  article status <slug>          — قراءات، قراءات مكتملة، تعليقات، محفوظات، حالة التعليق" },
    { type: "muted", text: "  article toggle-comments <slug> — فتح/إغلاق باب التعليق على المقال لحظيًا دون نشر" },
  ],
  cache: [
    { type: "info", text: "cache — عمليات الكاش:" },
    { type: "muted", text: "  cache purge all     — إفراغ شامل (كل الصفحات + التكوين)" },
    { type: "muted", text: "  cache purge <path>  — إفراغ مسار محدد مثل /articles/trend-master" },
    { type: "muted", text: "  cache purge-all     — اختصار للإفراغ الشامل" },
  ],
  db: [
    { type: "info", text: "db — قاعدة البيانات:" },
    { type: "muted", text: "  db stats         — الجداول والسجلات والأحجام والعدادات الدقيقة" },
    { type: "muted", text: "  db slow-queries  — أبطأ 12 عملية في آخر 24 ساعة (فوق 1.5 ثانية أو خاطئة)" },
  ],
  sec: [
    { type: "info", text: "sec — الأمن وجدار الحماية:" },
    { type: "muted", text: "  sec audit              — فحص حي للترويسات الأمنية (CSP/XFO/nosniff/HSTS) للمنصة العامة" },
    { type: "muted", text: "  sec block-ip <ip> [سبب] — إضافة عنوان للقائمة السوداء فورًا" },
    { type: "muted", text: "  sec active-logins      — آخر 10 دخولات: الجهاز، المتصفح، الموقع الجغرافي" },
    { type: "muted", text: "  security tail [n]      — اللوحة الأمنية المجملة للتنبيهات" },
  ],
  spark: [
    { type: "info", text: "spark — الذكاء السيادي:" },
    { type: "muted", text: "  spark exec \"امنع التعليقات على مقال كذا\" — يحول الذكاء الاصطناعي الطلب لأمر سيادي وينفذه فورًا" },
    { type: "muted", text: "  إشعار: التنفيذ الفعلي يبقى محكومًا ببوابات الصلاحيات نفسها — لا تجاوز للتوثيق" },
  ],
  config: [
    { type: "info", text: "config — التكوين السيادي:" },
    { type: "muted", text: "  config list | config get <key> | config set <key> <value> — عرض/قراءة/تعديل لحظي" },
  ],
  notify: [
    { type: "info", text: "notify — منظومة الإشعارات الموحدة:" },
    { type: "muted", text: "  notify send <email | all> --title \"..\" --body \"..\" [--channel push|email|inapp|all] — إرسال عبر المرسل المركزي (جرس + بث + بريد حسب القناة)" },
    { type: "muted", text: "  notify inspect <email> — آخر 10 إشعارات وصلت للمستخدم وحالة قراءتها" },
    { type: "muted", text: "  notify purge-old --days N — حذف الإشعارات المقروءة الأقدم من N يومًا لمنع تضخم القاعدة" },
  ],
};


/* ==================== أوامر الإشعارات — عبر المرسل المركزي الموحد ==================== */

async function cmdNotifySend(
  target: string,
  flags: Map<string, string | true>,
  ctx: CliContext,
): Promise<CliLine[]> {
  const title = String(flags.get("title") ?? "");
  const body = String(flags.get("body") ?? "");
  if (!title || !body)
    return [{ type: "error", text: "الصيغة: notify send <email | all> --title \"..\" --body \"..\" [--channel push|email|inapp|all]" }];
  const channelRaw = String(flags.get("channel") ?? "all").toLowerCase();
  const channels = (
    channelRaw === "push" ? "WEB_PUSH" : channelRaw === "email" ? "EMAIL" : channelRaw === "inapp" ? "IN_APP" : "ALL"
  ) as "WEB_PUSH" | "EMAIL" | "IN_APP" | "ALL";
  const { dispatchNotification, dispatchBroadcast } = await import("@/lib/notifications/dispatcher");

  if (target.toLowerCase() === "all") {
    const r = await dispatchBroadcast({
      type: "BROADCAST",
      title,
      message: body,
      channels,
      pushTag: "cli-broadcast",
      metadata: { via: `cli:${ctx.source}`, by: ctx.adminUsername },
    });
    return [{ type: "ok", text: `بُثّ الإشعار للجميع: جرس ${r.inApp} | بث ويب ${r.pushSent}` }];
  }

  const user = await resolveUser(target);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${target}»` }];
  const r = await dispatchNotification({
    userId: user.id,
    type: "BROADCAST",
    title,
    message: body,
    channels,
    pushTag: "cli-notify",
    metadata: { via: `cli:${ctx.source}`, by: ctx.adminUsername },
  });
  return [
    {
      type: "ok",
      text: `أُرسل الإشعار إلى ${user.email ?? user.id}: جرس ${r.inApp ? "✓" : "×"} | بث ${r.pushSent ? "✓" : "×"} | بريد ${r.emailSent ? "✓" : "×"}`,
    },
  ];
}

async function cmdNotifyInspect(target: string): Promise<CliLine[]> {
  if (!target) return [{ type: "error", text: "الصيغة: notify inspect <email>" }];
  const user = await resolveUser(target);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${target}»` }];
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  if (items.length === 0) return [{ type: "muted", text: "لا إشعارات موثقة لهذا الحساب بعد" }];
  const lines: CliLine[] = [
    { type: "info", text: `آخر 10 إشعارات لـ «${user.email ?? user.id}» — غير المقروء: ${unread}` },
  ];
  for (const n of items) {
    lines.push({
      type: "muted",
      text: `  ${n.createdAt.toISOString().slice(0, 16).replace("T", " ")} [${n.type}] ${n.isRead ? "مقروء ✓" : "غير مقروء ●"} — ${n.title}`,
    });
  }
  return lines;
}

async function cmdNotifyPurge(flags: Map<string, string | true>): Promise<CliLine[]> {
  const days = String(flags.get("days") ?? "30");
  if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365)
    return [{ type: "error", text: "--days يجب أن يكون عددًا بين ١ و ٣٦٥" }];
  const cut = new Date(Date.now() - Number(days) * 86_400_000);
  const res = await prisma.notification.deleteMany({ where: { isRead: true, readAt: { lte: cut } } });
  return [{ type: "ok", text: `حُذف ${res.count} إشعارًا مقروءًا أقدم من ${days} يومًا — قاعدة الإشعارات تخفّت` }];
}

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

/** اللوحة الأمنية الحية — تنبيهات + محاولات اختراق + اصطياد بوتات + حدود معدل */
async function cmdSecurityTail(n: number): Promise<CliLine[]> {
  const take = Math.min(Math.max(n, 1), 40);
  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const [alerts, fails24h, brute24h, honeypot24h, throttle24h] = await Promise.all([
    prisma.securityAlert.findMany({ orderBy: { createdAt: "desc" }, take }),
    prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
    prisma.securityAlert.count({ where: { type: "BRUTE_FORCE", createdAt: { gte: since24h } } }),
    prisma.securityAlert.count({ where: { type: "HONEYPOT", createdAt: { gte: since24h } } }),
    prisma.securityAlert.count({ where: { type: "RATE_LIMIT", createdAt: { gte: since24h } } }),
  ]);

  const lines: CliLine[] = [
    { type: "info", text: `اللوحة الأمنية — آخر 24 ساعة: ${fails24h} محاولة دخول فاشلة | ${brute24h} حظر تسجيل دخول | ${honeypot24h} بوت ماصوص | ${throttle24h} تجاوز حد معدل` },
  ];
  if (!alerts.length) {
    lines.push({ type: "ok", text: "لا تنبيهات أمنية — الأسوار صامتة والنظام صافٍ" });
    return lines;
  }
  for (const a of alerts) {
    const sev = a.severity === "CRITICAL" ? "error" : a.severity === "WARN" ? "warn" : "muted";
    lines.push({
      type: sev as CliLineType,
      text: `${a.createdAt.toISOString().slice(11, 19)} [${a.severity}] ${a.type} — ${a.message.slice(0, 110)}`,
    });
  }
  return lines;
}

/* ==================== المنفذون — الموجة السيادية الموسعة ==================== */

/** sys ping — ثلاث قياسات دقيقة لزمن استجابة Neon والخادم */
async function cmdSysPing(): Promise<CliLine[]> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    samples.push(Date.now() - t0);
  }
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const verdict = avg < 100 ? "ممتاز" : avg < 300 ? "جيد" : avg < 800 ? "مقبول" : "بطيء — افحص الشبكة";
  return [
    { type: "info", text: `زمن استجابة Neon: ${samples.join("ms | ")}ms — المتوسط ${avg}ms (${verdict})` },
    { type: avg < 300 ? "ok" : "warn", text: `القياسات من خادم ${process.env.VERCEL_REGION ?? "local"} — اتصال مباشر بقاعدة الإنتاج` },
  ];
}

/** sys env — تدقيق صحي للمتغيرات دون كشف أي قيمة */
async function cmdSysEnv(): Promise<CliLine[]> {
  const required: { key: string; label: string; critical: boolean }[] = [
    { key: "DATABASE_URL", label: "قاعدة Neon", critical: true },
    { key: "ADMIN_SESSION_SECRET", label: "سر الجلسات الإدارية", critical: true },
    { key: "PUBLIC_URL", label: "رابط المنصة العامة", critical: false },
    { key: "REVALIDATE_SECRET", label: "سر إعادة التحقق", critical: false },
    { key: "GEMINI_API_KEY", label: "الذكاء الاصطناعي", critical: false },
    { key: "RESEND_API_KEY", label: "البريد الإلكتروني", critical: false },
    { key: "CLOUDINARY_CLOUD_NAME", label: "الوسائط", critical: false },
    { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", label: "بث الإشعارات (عام)", critical: false },
    { key: "VAPID_PRIVATE_KEY", label: "بث الإشعارات (خاص)", critical: false },
    { key: "NEXT_PUBLIC_ADMIN_URL", label: "رابط اللوحة", critical: false },
  ];
  const lines: CliLine[] = [{ type: "info", text: "تدقيق البيئة — الحالة فقط بلا أي قيم:" }];
  for (const v of required) {
    const present = Boolean(process.env[v.key]);
    lines.push({
      type: present ? "ok" : v.critical ? "error" : "warn",
      text: `  ${present ? "✓" : "✗"} ${v.key.padEnd(24)} ${v.label}${present ? " — مُهيأ" : v.critical ? " — ناقص حرج!" : " — غير مُهيأ (اختياري)"}`,
    });
  }
  return lines;
}

/** مستخرج أعلام --key <value> / --flag من بقية الأمر */
function parseFlags(parts: string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (p.startsWith("--")) {
      const key = p.slice(2).toLowerCase();
      const next = parts[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next.replace(/^"|"$/g, ""));
        i += 2;
      } else {
        flags.set(key, true);
        i += 1;
      }
    } else {
      positional.push(p.replace(/^"|"$/g, ""));
      i += 1;
    }
  }
  return { positional, flags };
}

/** user grant-vip / vip-grant — منح العضوية المميزة المستقلة: الشارة والرتبة والنقاط عبر المنطق الموحد */
async function cmdUserGrantVip(query: string, flags: Map<string, string | true>, ctx: CliContext): Promise<CliLine[]> {
  if (!query) return [{ type: "error", text: "الصيغة: user grant-vip <email> --title \"..\" --color \"#..\" --reason \"..\" [--points N] [--role R] [--unlimited-ai]" }];
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];

  const title = String(flags.get("title") ?? flags.get("badge") ?? "");
  const color = String(flags.get("color") ?? "#7C3AED");
  const reason = String(flags.get("reason") ?? `منح تمييز عبر التيرمينال السيادي بيد ${ctx.adminUsername}`);
  const points = Number(flags.get("points") ?? 0) || 0;
  const roleRaw = String(flags.get("role") ?? "").toUpperCase();

  const privileges: VipPrivileges = {};
  if (flags.has("unlimited-ai") || flags.has("unlimited_ai")) privileges.unlimitedAiChat = true;

  try {
    const result = await grantVip(
      {
        userId: user.id,
        badgeTitle: title,
        badgeColor: color,
        reason,
        privileges,
        welcomePoints: points,
        role: (["USER", "MODERATOR", "EDITOR", "ADMIN"].includes(roleRaw) ? roleRaw : undefined) as GrantableRole | undefined,
      },
      { adminId: ctx.adminId, adminUsername: ctx.adminUsername, ip: ctx.ip, via: `cli:${ctx.source}` },
    );
    return [
      { type: "ok", text: `مُنحت شارة «${result.badgeTitle}» بلون ${result.badgeColor} للحساب ${result.user.label}${roleRaw ? ` — الرتبة: ${roleLabelAr(roleRaw)}` : ""}` },
      {
        type: "muted",
        text: `الإشعارات: جرس ${result.dispatch.inApp ? "✓" : "×"} | بث ${result.dispatch.pushSent ? "✓" : "×"} | بريد ${result.dispatch.emailSent ? "✓" : "×"}${
          result.impactScore !== undefined ? ` | الرصيد الآن ${result.impactScore}` : ""
        }`,
      },
    ];
  } catch (e) {
    return [{ type: "error", text: e instanceof Error ? e.message : "تعذر المنح" }];
  }
}

/** user set-points — تعديل الرصيد بقيمة مطلقة موثقة */
async function cmdUserSetPoints(query: string, value: string, ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  const target = Math.floor(Number(value));
  if (!Number.isFinite(target) || target < 0 || target > 1_000_000) {
    return [{ type: "error", text: "القيمة المطلوبة غير صالحة (0 إلى 1,000,000)" }];
  }
  const delta = target - user.impactScore;
  if (delta === 0) return [{ type: "info", text: `الرصيد ${target} أصلًا — لا تعديل` }];
  const { awardImpact } = await import("@/lib/impact");
  const result = await awardImpact({
    userId: user.id,
    actionType: "ADMIN_ADJUST",
    points: delta,
    reason: `تعديل يدوي بقيمة مطلقة ${target} عبر التيرمينال السيادي (${delta > 0 ? "+" : ""}${delta})`,
  });
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.user_set_points",
    entity: "User",
    entityId: user.id,
    meta: { via: ctx.source, by: ctx.adminUsername, target, delta, newScore: result.impactScore },
    ip: ctx.ip,
  });
  return [
    { type: "ok", text: `عُدّل رصيد ${user.email ?? user.id}: ${user.impactScore} → ${result.impactScore} (${delta > 0 ? "+" : ""}${delta})` },
    { type: "muted", text: `الرتبة الآن: ${result.rank}` },
  ];
}

/** user verify — التوثيق الرسمي فقط (إثبات هوية، بلا صلاحيات ولا نقاط ولا شارة) */
async function cmdUserVerify(query: string, flags: Map<string, string | true>, ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  const typeRaw = String(flags.get("type") ?? "OFFICIAL_AUTHOR").toUpperCase() as VerificationType;
  if (!VERIFICATION_TYPES.includes(typeRaw)) {
    return [{ type: "error", text: `نوع توثيق غير معروف: ${typeRaw} — المتاح: ${VERIFICATION_TYPES.join(" | ")}` }];
  }
  if (!GRANTABLE_VERIFICATION_TYPES.includes(typeRaw as never) && typeRaw === "OWNER") {
    return [{ type: "error", text: "توثيق «المؤسس» حصري بالبذر السيادي التلقائي — لا يُمنح يدويًا" }];
  }
  const badge = flags.has("badge") ? String(flags.get("badge")) : undefined;
  try {
    const result = await grantVerification(
      {
        userId: user.id,
        verificationType: typeRaw,
        label: badge ?? null,
        reason: flags.has("reason") ? String(flags.get("reason")) : `منح توثيق رسمي (${verificationSealLabel(typeRaw, badge)}) عبر التيرمينال السيادي`,
      },
      { adminId: ctx.adminId, adminUsername: ctx.adminUsername, ip: ctx.ip, via: `cli:${ctx.source}` },
    );
    return [
      { type: "ok", text: `وُثّق ${user.email ?? user.id} كـ«${result.sealLabel}» بختم ${result.sealColor} — علامة التوثيق بلا أي عضوية مميزة` },
      { type: "muted", text: `الإشعارات: جرس ${result.dispatch.inApp ? "✓" : "×"} | بث ${result.dispatch.pushSent ? "✓" : "×"} | بريد ${result.dispatch.emailSent ? "✓" : "×"}` },
    ];
  } catch (e) {
    return [{ type: "error", text: e instanceof Error ? e.message : "تعذر التوثيق" }];
  }
}

/** user unverify — سحب التوثيق الرسمي فقط، العضوية المميزة لا تُمس */
async function cmdUserUnverify(query: string, flags: Map<string, string | true>, positional: string[], ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  const reason =
    (flags.has("reason") ? String(flags.get("reason")) : "") ||
    positional.join(" ") ||
    "سحب التوثيق الرسمي بقرار إداري من التيرمينال السيادي";
  try {
    await revokeVerification(
      { userId: user.id, reason },
      { adminId: ctx.adminId, adminUsername: ctx.adminUsername, ip: ctx.ip, via: `cli:${ctx.source}` },
    );
    return [{ type: "ok", text: `سُحب توثيق ${user.email ?? user.id} وأُرسل إشعار التحديث — العضوية المميزة إن وُجدت لم تُمس` }];
  } catch (e) {
    return [{ type: "error", text: e instanceof Error ? e.message : "تعذر سحب التوثيق" }];
  }
}

/** user un-vip / vip-revoke — سحب العضوية المميزة فقط عبر المنطق الموحد */
async function cmdUserRevokeVip(query: string, reason: string | undefined, resetRole: boolean, ctx: CliContext): Promise<CliLine[]> {
  const user = await resolveUser(query);
  if (!user) return [{ type: "error", text: `لا يوجد قارئ مطابق لـ «${query}»` }];
  try {
    await revokeVip(
      { userId: user.id, reason: reason?.trim() || "سحب العضوية المميزة بقرار إداري من التيرمينال السيادي", resetRole },
      { adminId: ctx.adminId, adminUsername: ctx.adminUsername, ip: ctx.ip, via: `cli:${ctx.source}` },
    );
    return [{ type: "ok", text: `سُحبت العضوية المميزة من ${user.email ?? user.id} وأُرسل إشعار التحديث — التوثيق الرسمي لم يُمس` }];
  } catch (e) {
    return [{ type: "error", text: e instanceof Error ? e.message : "تعذر السحب" }];
  }
}

/** article status — إحصاءات مقال بالـ slug */
async function cmdArticleStatus(slug: string): Promise<CliLine[]> {
  const article = await prisma.article.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true, status: true, views: true, completedReads: true, commentsEnabled: true,
      _count: { select: { comments: true, savedBy: true, shares: true } },
    },
  });
  if (!article) return [{ type: "error", text: `لا مقال بالـ slug «${slug}»` }];
  const [approved, pending] = await Promise.all([
    prisma.comment.count({ where: { articleId: article.id, status: "APPROVED" } }),
    prisma.comment.count({ where: { articleId: article.id, status: "PENDING" } }),
  ]);
  return [
    { type: "info", text: `«${article.title}» — الحالة: ${article.status}` },
    { type: "muted", text: `القراءات: ${article.views} | المكتملة: ${article.completedReads} | المحفوظات: ${article._count.savedBy} | المشاركات: ${article._count.shares}` },
    { type: "muted", text: `التعليقات: ${approved} معتمد، ${pending} منتظر (${article._count.comments} كلي) | باب التعليق: ${article.commentsEnabled ? "مفتوح" : "مغلق"}` },
  ];
}

/** article toggle-comments — فتح/إغلاق باب التعليق لحظيًا */
async function cmdArticleToggleComments(slug: string, ctx: CliContext): Promise<CliLine[]> {
  const article = await prisma.article.findUnique({ where: { slug }, select: { id: true, title: true, commentsEnabled: true } });
  if (!article) return [{ type: "error", text: `لا مقال بالـ slug «${slug}»` }];
  const next = !article.commentsEnabled;
  await prisma.article.update({ where: { id: article.id }, data: { commentsEnabled: next } });
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.article_toggle_comments",
    entity: "Article",
    entityId: article.id,
    meta: { via: ctx.source, slug, commentsEnabled: next },
    ip: ctx.ip,
  });
  revalidatePath(`/article/${slug}`);
  await revalidatePublicPaths([`/article/${slug}`]);
  return [
    { type: "ok", text: `${next ? "فُتح" : "أُغلق"} باب التعليق على «${article.title}» — انعكس على المنصة العامة فورًا` },
  ];
}

/** db slow-queries — أبطأ العمليات في آخر 24 ساعة من سجل الحركة */
async function cmdDbSlowQueries(): Promise<CliLine[]> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const rows = await prisma.requestLog.findMany({
    where: { createdAt: { gte: since }, durationMs: { not: null } },
    orderBy: { durationMs: "desc" },
    take: 12,
  });
  const slow = rows.filter((r) => (r.durationMs ?? 0) > 1500 || r.isError);
  if (!slow.length) {
    return [{ type: "ok", text: "لا عمليات بطيئة مرصودة في آخر 24 ساعة — كل الاستجابات تحت 1.5 ثانية" }];
  }
  return slow.map((r) => ({
    type: (r.isError ? "error" : "warn") as CliLineType,
    text: `${String(r.durationMs ?? 0).padStart(6)}ms  ${(r.method ?? "?").padEnd(5)} ${(r.path ?? "").slice(0, 44).padEnd(46)} ${r.status ?? "—"} ${r.createdAt.toISOString().slice(11, 19)}`,
  }));
}

/** sec audit — فحص حي لترويسات المنصة العامة الأمنية */
async function cmdSecAudit(): Promise<CliLine[]> {
  const url = process.env.PUBLIC_URL || "https://kalam-ziadamr.vercel.app";
  const lines: CliLine[] = [{ type: "info", text: `فحص الترويسات الأمنية الحية: ${url}` }];
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const h = res.headers;
    const checks: { name: string; value: string | null; required: boolean }[] = [
      { name: "Content-Security-Policy", value: h.get("content-security-policy"), required: true },
      { name: "X-Frame-Options", value: h.get("x-frame-options"), required: true },
      { name: "X-Content-Type-Options", value: h.get("x-content-type-options"), required: true },
      { name: "Strict-Transport-Security", value: h.get("strict-transport-security"), required: true },
      { name: "Referrer-Policy", value: h.get("referrer-policy"), required: true },
      { name: "Permissions-Policy", value: h.get("permissions-policy"), required: false },
    ];
    for (const c of checks) {
      lines.push({
        type: c.value ? "ok" : c.required ? "error" : "warn",
        text: `  ${c.value ? "✓" : c.required ? "✗" : "⚠"} ${c.name.padEnd(28)} ${c.value ? c.value.slice(0, 80) : "غائبة!"}`,
      });
    }
    const csp = h.get("content-security-policy") ?? "";
    if (csp) {
      lines.push({
        type: csp.includes("object-src 'none'") ? "ok" : "warn",
        text: `  ${csp.includes("object-src 'none'") ? "✓" : "⚠"} CSP: object-src 'none' ${csp.includes("default-src 'self'") ? "| default-src 'self' ✓" : "| default-src غير صارم ⚠"}`,
      });
    }
    lines.push({ type: "info", text: `كود الاستجابة: ${res.status}` });
  } catch {
    lines.push({ type: "error", text: "تعذر الوصول للمنصة العامة من هذه البيئة — الفحص الحي يتطلب شبكة مفتوحة" });
  }
  return lines;
}

/** sec block-ip — حجب عنوان فورًا */
async function cmdSecBlockIp(ip: string, note: string | undefined, ctx: CliContext): Promise<CliLine[]> {
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return [{ type: "error", text: `عنوان IP غير سليم: ${ip}` }];
  await prisma.ipRule.upsert({
    where: { ip },
    create: { ip, mode: "DENY", note: note || "حجب عبر التيرمينال السيادي" },
    update: { mode: "DENY", note: note || "حجب عبر التيرمينال السيادي" },
  });
  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.sec_block_ip",
    entity: "IpRule",
    entityId: ip,
    meta: { via: ctx.source, ip, note },
    ip: ctx.ip,
  });
  return [{ type: "ok", text: `أُضيف ${ip} للقائمة السوداء — الوسيط يرفضه من اللحظة التالية${note ? ` — ${note}` : ""}` }];
}

/** sec active-logins — آخر 10 دخولات موثقة */
async function cmdSecActiveLogins(): Promise<CliLine[]> {
  const rows = await prisma.loginLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  if (!rows.length) return [{ type: "muted", text: "لا دخولات موثقة بعد" }];
  return [
    { type: "info", text: "آخر 10 دخولات موثقة:" },
    ...rows.map((l) => ({
      type: "muted" as const,
      text: `  ${l.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${(l.browser ?? "?").padEnd(14)} ${(l.deviceType ?? "?").padEnd(8)} ${[l.city, l.country].filter(Boolean).join(", ") || "موقع غير معروف"}${l.isNewDevice ? "  ← جهاز جديد!" : ""}`,
    })),
  ];
}

/* ==================== السجل السيادي — audit ==================== */

/** audit list — قيود الفترة + أرقام الملخص التنفيذي */
async function cmdAuditList(flags: Map<string, string | true>): Promise<CliLine[]> {
  const days = String(flags.get("days") ?? "7");
  if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365)
    return [{ type: "error", text: "--days يجب أن يكون عددًا بين ١ و ٣٦٥" }];
  const categoryRaw = String(flags.get("category") ?? "ALL").toUpperCase();
  if (categoryRaw !== "ALL" && !(TRAIL_CATEGORIES as readonly string[]).includes(categoryRaw))
    return [
      {
        type: "error",
        text: `تصنيف غير معروف: ${categoryRaw} — المتاح: ${TRAIL_CATEGORIES.join(" | ")}`,
      },
    ];

  const range = resolveLedgerRange(days);
  const { entries, summary } = await loadLedger({
    range,
    category: categoryRaw as TrailCategoryFilter,
    take: 30,
  });

  const lines: CliLine[] = [
    {
      type: "info",
      text: `السجل السيادي — آخر ${days} يومًا${categoryRaw !== "ALL" ? ` (${categoryRaw})` : ""}: ${summary.total} قيدًا رقابيًا`,
    },
    {
      type: "muted",
      text: `  الملخص: محو حسابات ${summary.hardDeletes} · حظر ${summary.bans} · تمييز تعليقات ${summary.featured} · توثيق ورُتب ${summary.vipChanges} · إعدادات ${summary.configChanges}`,
    },
  ];

  if (!entries.length) {
    lines.push({ type: "muted", text: "  لا قيود في الفترة — سلامة كاملة بلا إجراءات حساسة." });
    return lines;
  }

  lines.push(
    ...entries.map((e) => ({
      type: "muted" as const,
      text: `  ${e.createdAt.toISOString().slice(0, 16).replace("T", " ")}  [${e.actionCategory}] ${e.actionType}  ${e.actorEmail}${e.actorRole ? ` (${e.actorRole})` : ""} ← ${e.targetEmail ?? "—"}${e.id ? `  · ${e.id}` : ""}`,
    })),
  );
  if (summary.total > entries.length)
    lines.push({ type: "muted", text: `  … وأحدث ٣٠ فقط معروضة من أصل ${summary.total} — استخدم audit inspect <id> للتفاصيل` });
  return lines;
}

/** audit inspect — القيد الكامل بتفاصيله التقنية */
async function cmdAuditInspect(auditId: string): Promise<CliLine[]> {
  if (!auditId) return [{ type: "error", text: "الصيغة: audit inspect <auditId>" }];
  const e = await prisma.auditTrail.findUnique({ where: { id: auditId } });
  if (!e) return [{ type: "error", text: `لا يوجد قيد رقابي بالمعرف ${auditId}` }];
  const meta = e.metadata ? JSON.stringify(e.metadata, null, 2).split("\n") : [];
  return [
    { type: "info", text: `القيد الرقابي ${e.id} — ${e.actionType} (${e.actionCategory})` },
    { type: "muted", text: `  الفاعل: ${e.actorEmail} (${e.actorRole}) — ${e.createdAt.toISOString().slice(0, 16).replace("T", " ")}` },
    { type: "muted", text: `  المستهدف: ${e.targetEmail ?? e.targetId ?? "—"}` },
    { type: "muted", text: `  السبب: ${e.reason ?? "—"}` },
    { type: "muted", text: `  الدليل: ${e.evidenceUrl ?? "بدون دليل مصور"}` },
    ...(meta.length
      ? [
          { type: "muted" as const, text: "  التفاصيل التقنية:" },
          ...meta.map((l) => ({ type: "muted" as const, text: `    ${l}` })),
        ]
      : []),
  ];
}

/** audit export-pdf — التقرير الرقابي الفاخر → مجلد الأدلة المحمي → رابط تنزيل */
async function cmdAuditExportPdf(flags: Map<string, string | true>, ctx: CliContext): Promise<CliLine[]> {
  const range = String(flags.get("range") ?? "weekly").toLowerCase();
  if (!["weekly", "monthly", "custom"].includes(range))
    return [{ type: "error", text: "--range يقبل weekly | monthly | custom (مع --from و --to بصيغة YYYY-MM-DD)" }];
  const from = String(flags.get("from") ?? "");
  const to = String(flags.get("to") ?? "");

  const ledgerRange = resolveLedgerRange(range, from || null, to || null);
  const { summary } = await loadLedger({ range: ledgerRange, take: 500 });
  /* رابط تنزيل موقّع HMAC — 30 يوم صلاحية، بلا تخزين خارجي */
  const sharedUrl = buildAuditShareUrl(range === "monthly" ? "monthly" : "weekly");

  await writeAudit({
    adminId: ctx.adminId,
    action: "cli.audit_export_pdf",
    entity: "AuditTrail",
    entityId: `shared:${range}`,
    meta: { via: ctx.source, range: ledgerRange.label, entries: summary.total, url: sharedUrl },
    ip: ctx.ip,
  });

  return [
    { type: "ok", text: `ولّد التقرير الرقابي (${ledgerRange.label}) — ${summary.total} قيدًا رقابيًا` },
    { type: "muted", text: `  الملخص: محو ${summary.hardDeletes} · حظر ${summary.bans} · تمييز ${summary.featured} · توثيق ${summary.vipChanges} · إعدادات ${summary.configChanges}` },
    { type: "info", text: `  رابط التنزيل الموقّع (صالح 30 يومًا): ${sharedUrl}` },
  ];
}

/** user hard-delete — المحو السيادي الشامل الموثق بالدليل */
async function cmdUserHardDelete(
  target: string,
  flags: Map<string, string | true>,
  ctx: CliContext,
): Promise<CliLine[]> {
  const user = await resolveUser(target);
  if (!user) return [{ type: "error", text: `لا يوجد مستخدم مطابق: ${target}` }];

  const reasonCode = String(flags.get("reason-code") ?? flags.get("code") ?? "OFFICIAL_USER_REQUEST").toUpperCase();
  if (!isHardDeleteReason(reasonCode)) {
    return [
      {
        type: "error",
        text: `--reason-code يقبل فقط: ${HARD_DELETE_REASONS.map((r) => r.value).join(" | ")}`,
      },
    ];
  }
  const reason = String(flags.get("reason") ?? "");
  const evidenceUrl = String(flags.get("evidence") ?? "");

  const result = await hardDeleteUser(
    {
      userId: user.id,
      reason,
      reasonCode,
      evidenceUrl,
    },
    {
      adminId: ctx.adminId,
      actorEmail: ctx.adminUsername,
      actorRole: "SYSTEM",
      ip: ctx.ip,
      userAgent: `cli:${ctx.source}`,
      via: ctx.source === "mcp" ? "cli:mcp" : "cli:web",
    },
  );

  return [
    { type: "ok", text: `مُحيا حساب ${result.target.email ?? result.target.label} محوًا برمجيًا شاملًا — قيد التدقيق ${result.auditId}` },
    { type: "muted", text: `  السبب الموثق: [${hardDeleteReasonLabel(reasonCode)}] ${reason}` },
    { type: "muted", text: `  المحو: تعليقات ${result.deletedCounts.comments ?? 0} · تفاعلات ${result.deletedCounts.interactions ?? 0} · أثر ${result.deletedCounts.impactLedger ?? 0} · محفوظات ${result.deletedCounts.savedArticles ?? 0} · إشعارات ${result.deletedCounts.notifications ?? 0} · جلسات ${result.deletedCounts.sessions ?? 0}` },
    { type: "muted", text: `  الأصول السحابية المزالة: ${result.assetsRemoved.length} — صفحات أُعيد توليدها: ${result.revalidatedSlugs}` },
  ];
}

/** spark exec — انطة طبيعية → أمر سيادي عبر الذكاء ثم تنفيذ */
async function cmdSparkExec(query: string, ctx: CliContext): Promise<CliLine[]> {
  if (!query) return [{ type: "error", text: "الصيغة: spark exec \"<طلبك باللغة الطبيعية>\"" }];
  const { geminiChat, geminiConfigured } = await import("@/lib/gemini-inference");
  if (!geminiConfigured()) {
    return [{ type: "error", text: "محرك الذكاء غير مُهيأ في هذه البيئة (GEMINI_API_KEY)" }];
  }
  const catalog =
    "الأوامر المتاحة: sys info | sys ping | sys env | cache purge all|<path> | user inspect <email> | user vip-grant <email> --title \"..\" --color \"#hex\" --reason \"..\" [--points N] [--role USER|MODERATOR|EDITOR|ADMIN] [--unlimited-ai] | user set-points <email> <n> | user verify <email> --type OFFICIAL_AUTHOR|FAMILY_CORE|NOTABLE [--badge \"..\"] | user unverify <email> --reason \"..\" | user vip-revoke <email> --reason \"..\" | user ban <email> [سبب] | user unban <email> | user hard-delete <email> --reason-code OFFICIAL_USER_REQUEST|SEVERE_DIALOGUE_VIOLATION|SECURITY_ABUSE --reason \"..\" --evidence \"https://..\" | audit list --days N [--category USER_SELF_ACTION|ADMIN_MODERATION|ADMIN_VIP_CHANGE|SYSTEM_CONFIG_CHANGE] | audit inspect <auditId> | audit export-pdf --range weekly|monthly | article status <slug> | article toggle-comments <slug> | config list|get <key>|set <key> <value> | db stats | db slow-queries | sec audit | sec block-ip <ip> | sec active-logins | traffic tail [n] | errors tail [n] | security tail [n] | notify send <email|all> --title \"..\" --body \"..\" [--channel push|email|inapp|all] | notify inspect <email> | notify purge-old --days N | help";
  const raw = await geminiChat({
    system:
      "أنت محول أوامر لترمينال إداري عربي. حوّل طلب المستخدم الطبيعي إلى أمر واحد فقط من الكتالوج. أعد JSON فقط بالصيغة {\"command\":\"...\"} وإن كان الطلب خارج الكتالوج أو خطرًا أعد {\"command\":null,\"why\":\"سبب\"}. لا تضف أي شرح.",
    turns: [{ role: "user", text: `الكتالوج:\n${catalog}\n\nالطلب: ${query}` }],
    jsonMode: true,
    temperature: 0.1,
    maxOutputTokens: 400,
    memoKind: "spark_exec",
  });
  let command: string | null = null;
  let why: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { command?: string | null; why?: string | null };
    command = parsed.command ?? null;
    why = parsed.why ?? null;
  } catch {
    why = "استجابة غير مفهومة من المحرك";
  }
  if (!command) {
    return [
      { type: "warn", text: `الذكاء السيادي لم يولّد أمرًا${why ? ` — ${why}` : ""}` },
      { type: "muted", text: "أعد الصياغة أو نفّذ الأمر يدويًا عبر help" },
    ];
  }
  const lines: CliLine[] = [
    { type: "info", text: `فهم الذكاء السيادي: ${command}` },
  ];
  const result = await runCliCommand(command, ctx);
  return [...lines, ...result];
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
      case "?": {
        const topic = (rest[0] ?? "").toLowerCase();
        if (topic && HELP_TOPICS[topic]) return HELP_TOPICS[topic];
        if (topic) return [{ type: "error", text: `لا شرح مفصل لـ «${topic}» — القائمة الكاملة أدناه:` }, ...HELP_LINES];
        return HELP_LINES;
      }

      case "sys":
      case "sysinfo": {
        const sub = (rest[0] ?? "info").toLowerCase();
        if (sub === "info") return cmdSysInfo();
        if (sub === "ping") return cmdSysPing();
        if (sub === "env") return cmdSysEnv();
        return [{ type: "error", text: `أمر sys غير معروف: sys ${sub} — المتاح: sys info | sys ping | sys env` }];
      }

      case "cache": {
        const [sub, ...pathParts] = rest;
        if ((sub ?? "").toLowerCase() === "purge-all")
          return cmdCachePurge("all");
        if ((sub ?? "").toLowerCase() !== "purge")
          return [{ type: "error", text: "الصيغة: cache purge [all | <path>] | cache purge-all" }];
        return cmdCachePurge(pathParts.join(" ") || "all");
      }

      case "user": {
        const [sub, target, ...tail] = rest;
        if (!target && sub !== "help")
          return [
            {
              type: "error",
              text: "الصيغة: user inspect <email|id> | user vip-grant <email> --title \"..\" --reason \"..\" | user verify <email> --type .. --badge \"..\" | user unverify <email> --reason \"..\" | user set-points <email> <n> | user vip-revoke <email> --reason \"..\" | user ban <email> [سبب] | user unban <email>",
            },
          ];
        switch ((sub ?? "").toLowerCase()) {
          case "inspect":
            return cmdUserInspect(target);
          case "grant-vip":
          case "make-vip":
          case "vip-grant": {
            const { flags } = parseFlags(tail);
            return cmdUserGrantVip(target, flags, ctx);
          }
          case "set-points": {
            const value = tail[0];
            if (!value) return [{ type: "error", text: "الصيغة: user set-points <email> <points>" }];
            return cmdUserSetPoints(target, value, ctx);
          }
          case "verify": {
            const { flags } = parseFlags(tail);
            return cmdUserVerify(target, flags, ctx);
          }
          case "unverify": {
            const { flags, positional } = parseFlags(tail);
            return cmdUserUnverify(target, flags, positional, ctx);
          }
          case "un-vip":
          case "revoke-vip":
          case "vip-revoke": {
            const { flags, positional } = parseFlags(tail);
            const reason = String(flags.get("reason") ?? "") || positional.join(" ");
            return cmdUserRevokeVip(target, reason, flags.has("reset-role"), ctx);
          }
          case "ban":
            return cmdUserBan(target, tail.join(" ") || undefined, ctx);
          case "unban":
            return cmdUserUnban(target, ctx);
          case "hard-delete":
          case "wipe": {
            const { flags } = parseFlags(tail);
            return cmdUserHardDelete(target, flags, ctx);
          }
          default:
            return [{ type: "error", text: `أمر user غير معروف: user ${sub}` }];
        }
      }

      case "article": {
        const [sub, slug] = rest;
        switch ((sub ?? "").toLowerCase()) {
          case "status":
            if (!slug) return [{ type: "error", text: "الصيغة: article status <slug>" }];
            return cmdArticleStatus(slug);
          case "toggle-comments":
            if (!slug) return [{ type: "error", text: "الصيغة: article toggle-comments <slug>" }];
            return cmdArticleToggleComments(slug, ctx);
          default:
            return [{ type: "error", text: "الصيغة: article status <slug> | article toggle-comments <slug>" }];
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
        if (sub === "stats") return cmdDbStats();
        if (sub === "slow-queries") return cmdDbSlowQueries();
        return [{ type: "error", text: "الصيغة: db stats | db slow-queries" }];
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

      case "security": {
        const sub = (rest[0] ?? "tail").toLowerCase();
        if (sub !== "tail") return [{ type: "error", text: "الصيغة: security tail [n]" }];
        return cmdSecurityTail(Number(rest[1]) || 10);
      }

      case "sec": {
        const [sub, target, ...noteParts] = rest;
        switch ((sub ?? "").toLowerCase()) {
          case "audit":
            return cmdSecAudit();
          case "block-ip": {
            if (!target) return [{ type: "error", text: "الصيغة: sec block-ip <ip> [سبب]" }];
            return cmdSecBlockIp(target, noteParts.join(" ") || undefined, ctx);
          }
          case "active-logins":
            return cmdSecActiveLogins();
          default:
            return [{ type: "error", text: "الصيغة: sec audit | sec block-ip <ip> [سبب] | sec active-logins" }];
        }
      }

      case "audit": {
        const [sub, target] = rest;
        switch ((sub ?? "").toLowerCase()) {
          case "list": {
            /* الأعلام تبدأ مباشرة بعد sub — لا موضعي قبلها */
            const { flags } = parseFlags(rest.slice(1));
            return cmdAuditList(flags);
          }
          case "inspect":
            if (!target) return [{ type: "error", text: "الصيغة: audit inspect <auditId>" }];
            return cmdAuditInspect(target);
          case "export-pdf": {
            const { flags } = parseFlags(rest.slice(1));
            return cmdAuditExportPdf(flags, ctx);
          }
          default:
            return [{ type: "error", text: "الصيغة: audit list --days N [--category ..] | audit inspect <id> | audit export-pdf --range weekly|monthly" }];
        }
      }

      case "notify": {
        const [sub, target] = rest;
        switch ((sub ?? "").toLowerCase()) {
          case "send": {
            if (!target)
              return [{ type: "error", text: "الصيغة: notify send <email | all> --title \"..\" --body \"..\" [--channel push|email|inapp|all]" }];
            const { flags } = parseFlags(rest.slice(2));
            return cmdNotifySend(target, flags, ctx);
          }
          case "inspect":
            if (!target) return [{ type: "error", text: "الصيغة: notify inspect <email>" }];
            return cmdNotifyInspect(target);
          case "purge-old": {
            const { flags } = parseFlags(rest.slice(1));
            return cmdNotifyPurge(flags);
          }
          default:
            return [{ type: "error", text: "الصيغة: notify send <email | all> --title \"..\" --body \"..\" | notify inspect <email> | notify purge-old --days N" }];
        }
      }

      case "spark": {
        const sub = (rest[0] ?? "").toLowerCase();
        if (sub !== "exec")
          return [{ type: "error", text: "الصيغة: spark exec \"<طلبك باللغة الطبيعية>\"" }];
        /* بقية السطر بعد exec — مع إسقاط الاقتباسات الخارجية */
        const query = rest.slice(1).join(" ").replace(/^"|"$/g, "");
        return cmdSparkExec(query, ctx);
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
