import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { loadLedger, resolveLedgerRange, type TrailCategoryFilter } from "@/lib/audit-ledger";
import { recordServerError } from "@/lib/error-alert";

/**
 * واجهة «السجل السيادي» — قيود التدقيق المصنفة بترشيح زمني وبالتصنيف.
 * تخدم شاشة /ledger: المرشحات (اليوم/آخر ٧ أيام/آخر شهر/تخصيص) + بطاقات
 * الإجراءات + أرقام الملخص التنفيذي.
 */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const days = url.searchParams.get("days"); // 1 | 7 | 30 | null
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const category = (url.searchParams.get("category") ?? "ALL") as TrailCategoryFilter;

    const range =
      days && /^\d+$/.test(days)
        ? resolveLedgerRange(days)
        : resolveLedgerRange("custom", from, to);
    const { entries, summary } = await loadLedger({ range, category, take: 150 });

    return NextResponse.json({ entries, summary, range: { label: range.label } });
  } catch (err) {
    await recordServerError({
      err,
      app: "ADMIN",
      path: "/api/audit/trail",
      method: "GET",
      requestId: null,
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/ledger`,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تحميل السجل السيادي" },
      { status: 400 },
    );
  }
}
