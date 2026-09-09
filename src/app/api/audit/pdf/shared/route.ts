import { NextResponse } from "next/server";
import { loadLedger, resolveLedgerRange } from "@/lib/audit-ledger";
import { renderAuditReportPdf } from "@/lib/audit-pdf";
import { verifyAuditShare } from "@/lib/audit-share";

/**
 * تنزيل التقرير الرقابي عبر رابط موقّع HMAC — القناة الدائمة التي
 * يعيدها أمر CLI audit export-pdf وأداة MCP kalam_generate_audit_pdf.
 * الحماية: توقيع صالح + انتهاء صلاحية (بلا جلسة إدارية).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = (url.searchParams.get("range") ?? "").toLowerCase();
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");

  if (!["weekly", "monthly"].includes(range)) {
    return NextResponse.json({ error: "نطاق التقرير يجب أن يكون weekly أو monthly" }, { status: 400 });
  }
  if (!verifyAuditShare(range, exp, sig)) {
    return NextResponse.json(
      { error: exp < Date.now() / 1000 ? "انتهت صلاحية رابط التقرير — ولّد رابطًا جديدًا" : "رابط غير موقّع — رفض الوصول" },
      { status: 403 },
    );
  }

  try {
    const ledgerRange = resolveLedgerRange(range);
    const { entries, summary } = await loadLedger({ range: ledgerRange, take: 500 });
    const buffer = await renderAuditReportPdf({
      entries,
      summary,
      range: ledgerRange,
      extractedBy: "رابط موقّع (CLI / Gemini Spark MCP)",
      reportNo: `AUD-SHARED-${range.toUpperCase()}-${new Date(exp * 1000).toISOString().slice(0, 10).replace(/-/g, "")}`,
    });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="kalam-audit-report-${range}-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `تعذر توليد التقرير: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }
}
