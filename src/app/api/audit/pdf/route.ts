import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { loadLedger, resolveLedgerRange, makeReportNo, type TrailCategoryFilter } from "@/lib/audit-ledger";
import { renderAuditReportPdf } from "@/lib/audit-pdf";
import { uploadRaw } from "@/lib/cloudinary";
import { recordServerError } from "@/lib/error-alert";

/**
 * تصدير التقرير الرقابي السيادي PDF — تنسيق عربي فاخر.
 *
 *  GET /api/audit/pdf?range=weekly|monthly|custom&from=..&to=..[&category=..][&upload=1]
 *
 *  افتراضيًا: تنزيل مباشر للتقرير (Content-Disposition: attachment).
 *  مع upload=1: يُرفع التقرير إلى «مجلد الأدلة المحمي» ويعيد { url }
 *  — القناة التي تستخدمها أداة MCP kalam_generate_audit_pdf والتيرمينال.
 */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range") ?? "weekly";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const category = (url.searchParams.get("category") ?? "ALL") as TrailCategoryFilter;
    const doUpload = url.searchParams.get("upload") === "1";

    const range = resolveLedgerRange(rangeParam, from, to);
    const { entries, summary } = await loadLedger({ range, category, take: 500 });

    const buffer = await renderAuditReportPdf({
      entries,
      summary,
      range,
      extractedBy: guard.username ?? "admin",
      reportNo: makeReportNo(),
    });

    if (doUpload) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const uploaded = await uploadRaw(buffer, `kalam-audit-report-${stamp}.pdf`);
      return NextResponse.json({ ok: true, url: uploaded.url, bytes: uploaded.bytes, summary, rangeLabel: range.label });
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="kalam-audit-report-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    await recordServerError({
      err,
      app: "ADMIN",
      path: "/api/audit/pdf",
      method: "GET",
      requestId: null,
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/ledger`,
    });
    return NextResponse.json(
      { error: `تعذر توليد التقرير الرقابي: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }
}
