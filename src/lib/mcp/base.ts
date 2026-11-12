/**
 * القاعدة المشتركة لأدوات MCP — الأنواع وخطأ الأداة الموحد
 * فُصلت في ملف مستقل كي تستوردها وحدات البنية التحتية الجديدة
 * (GitHub / Vercel / قاعدة البيانات / الخدمات) دون دوران استيراد،
 * بينما يُعيد executors.ts تصديرها حفاظًا على توافق الاستيراد القديم.
 */

export type McpArgs = Record<string, unknown>;
export type McpRequestMeta = { ip: string };

export class McpToolError extends Error {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

/* مساعدات قراءة المعاملات — نفس دلالات executors.ts حرفيًا */
export function str(args: McpArgs, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

export function num(args: McpArgs, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function bool(args: McpArgs, key: string): boolean | undefined {
  if (typeof args[key] === "boolean") return args[key] as boolean;
  if (args[key] === "true") return true;
  if (args[key] === "false") return false;
  return undefined;
}
