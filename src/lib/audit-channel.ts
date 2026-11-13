import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * ============================================================
 * سياق قناة التنفيذ الرقابي — مصدر الحقيقة لمصدر كل قيد
 * ============================================================
 * يُضبط عند مدخل كل قناة تنفيذ (بوابة MCP، التيرمينال السيادي،
 * الموقع العام) ثم يقرأه أي كاتب قيود (writeAudit/writeTrail)
 * لختم المصدر واسم العميل المتصل تلقائيًا دون تعديل 173 موقع كتابة.
 * اللوحة السيادية (WEB) هي الافتراضي عند غياب السياق.
 */

export type AuditChannel = "web" | "mcp" | "cli" | "public";

export type ChannelContext = {
  channel: AuditChannel;
  /** اسم العميل/الأداة المتصلة (MCP: Gemini/Bearer) أو اسم الأدمن (CLI) */
  label?: string;
};

const channelStore = new AsyncLocalStorage<ChannelContext>();

/** تنفيذ داخل سياق قناة محدد — يستدعيه مدخل كل قناة قبل أي منطق */
export function runWithChannel<T>(ctx: ChannelContext, fn: () => Promise<T>): Promise<T> {
  return channelStore.run(ctx, fn);
}

/** القناة الحالية — الافتراضي لوحة التحكم (WEB) */
export function currentChannel(): ChannelContext {
  return channelStore.getStore() ?? { channel: "web" };
}
