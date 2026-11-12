/**
 * أدوات البنية التحتية السيادية — قاعدة البيانات Neon PostgreSQL (v4.0.0)
 * فحص كامل للمخطط والجداول والمهاجرات + استعلام تنفيذي مؤمن يغطي
 * القراءة والكتابة والحذف (CRUD كامل) عبر Prisma Raw.
 * كل استعلام — قارئًا كان أو منفذًا — يُوثَّق في سجل التدقيق.
 * الدروع: وضع select للقراءة فقط، ومطالبة بإقرار confirm نصي قبل أي
 * تغيير، وحجب العبارات الكارثية نهائيًا.
 */

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/guard";
import {
  McpToolError,
  str,
  num,
  type McpArgs,
  type McpRequestMeta,
} from "@/lib/mcp/base";

/* عبارات لا تُنفَّذ إطلاقًا مهما كان الإقرار — خطر على القاعدة كلها */
const FORBIDDEN = [
  /drop\s+database/i,
  /drop\s+schema/i,
  /alter\s+system/i,
  /pg_read_file/i,
  /pg_ls_dir/i,
  /copy\s+.*\s+from\s+program/i,
  /create\s+extension/i,
  /lo_import/i,
  /lo_export/i,
];

function firstWord(sql: string): string {
  return sql.replace(/^\s*\(?\s*(select|with|insert|update|delete|create|alter|drop|truncate|grant|revoke|vacuum|analyze|explain|show|begin|commit|rollback|call|do)\b/i, "$1").split(/\s+/)[0]?.toUpperCase() ?? "";
}

async function dbQuery(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const sql = str(args, "sql");
  if (!sql) throw new McpToolError("استعلام sql إلزامي — عبارة واحدة (لا فصائل متعددة بـ ;)");
  if (sql.includes(";")) {
    throw new McpToolError("عبارة واحدة فقط — احذف الفاصلة المنقوطة وتنفذ الاستعلامات تباعًا");
  }
  const mode = str(args, "mode") ?? (firstWord(sql).startsWith("SELECT") || ["WITH", "SHOW", "EXPLAIN"].includes(firstWord(sql)) ? "select" : "execute");

  for (const pattern of FORBIDDEN) {
    if (pattern.test(sql)) {
      throw new McpToolError("عبارة محجوبة نهائيًا — تهدد القاعدة كلها. لو دعت الحاجة اعملها يدويًا من وحدة Neon");
    }
  }

  if (mode === "select") {
    const cmd = firstWord(sql);
    if (!["SELECT", "WITH", "SHOW", "EXPLAIN"].includes(cmd)) {
      throw new McpToolError(`وضع select يقبل قراءة فقط — العبارة تبدأ بـ${cmd}؛ مرر mode=execute للتنفيذ مع confirm`);
    }
    const limit = Math.min(Math.max(num(args, "limit") ?? 100, 1), 200);
    const started = Date.now();
    const rows = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    await writeAudit({
      adminId: null,
      action: "mcp.db_query_select",
      meta: { via: "gemini-spark-mcp", sql: sql.slice(0, 400), rows: rows.length, ms: Date.now() - started },
      ip: meta.ip,
    });
    return { mode: "select", rows: rows.length, ms: Date.now() - started, data: rows.slice(0, limit) };
  }

  /* وضع التنفيذ — الكتابة والتعديل والحذف (CRUD) */
  const confirm = str(args, "confirm");
  if (confirm !== "أؤقر التنفيذ") {
    throw new McpToolError(
      'التنفيذ المغيّر يستلزم الإقرار النصي: confirm = "أؤقر التنفيذ" — هذه حماية إلزامية وتُوثق العملية في سجل التدقيق',
    );
  }
  if (/^\s*truncate/i.test(sql)) {
    throw new McpToolError("TRUNCATE محجوب — استخدم DELETE WHERE مع فهم النطاق، أو نفذها يدويًا من Neon");
  }
  const started = Date.now();
  const affected = await prisma.$executeRawUnsafe(sql);
  await writeAudit({
    adminId: null,
    action: "mcp.db_query_execute",
    meta: { via: "gemini-spark-mcp", sql: sql.slice(0, 400), affected, ms: Date.now() - started },
    ip: meta.ip,
  });
  return { mode: "execute", affected, ms: Date.now() - started };
}

async function dbInspectSchema(args: McpArgs): Promise<unknown> {
  const table = str(args, "table");
  if (table) {
    const cols = (await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      table,
    )) as unknown[];
    const counts = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS rows FROM "${table.replace(/"/g, "")}"`,
    )) as { rows: number }[];
    return { table, rows: counts[0]?.rows ?? null, columns: cols };
  }
  const tables = (await prisma.$queryRawUnsafe(
    `SELECT t.table_name,
            pg_total_relation_size(quote_ident(t.table_name))::bigint AS bytes,
            (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = t.table_schema)::int AS columns
       FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY pg_total_relation_size(quote_ident(t.table_name)) DESC`,
  )) as { table_name: string; bytes: bigint | number; columns: number }[];
  const counts = (await prisma.$queryRawUnsafe(
    `SELECT relname AS table_name, n_live_tup::int AS approx_rows
       FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 100`,
  )) as { table_name: string; approx_rows: number }[];
  const rowMap = new Map(counts.map((c) => [c.table_name, c.approx_rows]));
  return {
    tables: tables.length,
    data: tables.map((t) => ({
      table: t.table_name,
      approx_rows: rowMap.get(t.table_name) ?? 0,
      columns: t.columns,
      size_kb: Math.round(Number(t.bytes) / 1024),
    })),
  };
}

async function dbMigrations(): Promise<unknown> {
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at, applied_steps_count, logs IS NOT NULL AS has_logs
         FROM _prisma_migrations ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 30`,
    )) as { migration_name: string; finished_at: Date | null; applied_steps_count: number; has_logs: boolean }[];
    const failed = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL`,
    )) as { n: number }[];
    return {
      applied: rows.length,
      pending_or_failed: failed[0]?.n ?? 0,
      migrations: rows.map((m) => ({
        name: m.migration_name,
        applied_at: m.finished_at?.toISOString() ?? null,
        steps: m.applied_steps_count,
      })),
    };
  } catch {
    return {
      applied: 0,
      pending_or_failed: null,
      note: "لا يوجد جدول _prisma_migrations — المخطط يُدار بـ prisma db push (بلا سجل مهاجرات)",
    };
  }
}

/** السجل الأمني/التشغيلي الخام — AuditLog بفلاتر حرّة */
async function getAuditLog(args: McpArgs): Promise<unknown> {
  const limit = Math.min(Math.max(num(args, "limit") ?? 50, 1), 200);
  const action = str(args, "action");
  const hours = Math.min(Math.max(num(args, "hours") ?? 24, 1), 24 * 30);
  const where: Record<string, unknown> = {
    createdAt: { gte: new Date(Date.now() - hours * 60 * 60_000) },
  };
  if (action) where.action = { contains: action, mode: "insensitive" };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" as const },
    take: limit,
    select: { id: true, action: true, entity: true, entityId: true, meta: true, ip: true, createdAt: true },
  });
  return {
    hours,
    count: rows.length,
    entries: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      ip: r.ip,
      meta: r.meta,
    })),
  };
}

/* ============================ الموزّع ============================ */

export async function executeDbTool(name: string, args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  switch (name) {
    case "db_query": return dbQuery(args, meta);
    case "db_inspect_schema": return dbInspectSchema(args);
    case "db_migrations": return dbMigrations();
    case "kalam_get_audit_log": return getAuditLog(args);
    default: throw new McpToolError(`أداة قاعدة البيانات غير معروفة: «${name}»`);
  }
}
