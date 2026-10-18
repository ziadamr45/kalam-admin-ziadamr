import React from "react";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * ============================================================
 * محرك التقرير الرقابي السيادي — PDF عربي فاخر
 * ============================================================
 * يولد تقرير امتثال دوري (أسبوعي/شهري/مخصص) من قيود «السجل
 * السيادي» بتنسيق عربي كامل: ترويسة سيادية، ملخص تنفيذي بالأرقام،
 * وجدول تفصيلي لكل قيد — الفاعل والإجراء والمستهدف والسبب والدليل.
 * يخدم: زر التصدير في شاشة السجل السيادي + التيرمينال + أداة MCP
 * kalam_generate_audit_pdf لـ Gemini Spark.
 */

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Tajawal",
    fonts: [
      { src: path.join(FONTS_DIR, "Tajawal-Regular.ttf") },
      { src: path.join(FONTS_DIR, "Tajawal-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Amiri",
    fonts: [
      { src: path.join(FONTS_DIR, "Amiri-Regular.ttf") },
      { src: path.join(FONTS_DIR, "Amiri-Bold.ttf"), fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

/* ==================== التسميات الموحدة ==================== */

export const CATEGORY_LABELS: Record<string, string> = {
  USER_SELF_ACTION: "إجراء ذاتي للمستخدم",
  ADMIN_MODERATION: "إشراف ورقابة",
  ADMIN_VIP_CHANGE: "توثيق ورُتب",
  SYSTEM_CONFIG_CHANGE: "إعدادات المنصة",
};

export const CATEGORY_COLORS: Record<string, string> = {
  USER_SELF_ACTION: "#0369A1",
  ADMIN_MODERATION: "#B91C1C",
  ADMIN_VIP_CHANGE: "#B45309",
  SYSTEM_CONFIG_CHANGE: "#4D7C0F",
};

const ACTION_LABELS: Record<string, string> = {
  USER_HARD_DELETE: "محو سيادي شامل لحساب",
  USER_SELF_HARD_DELETE: "حذف ذاتي شامل للحساب",
  ACCOUNT_BANNED: "حظر حساب",
  ACCOUNT_UNBANNED: "رفع حظر حساب",
  COMMENT_FEATURED: "تمييز تعليق",
  COMMENT_UNFEATURED: "إلغاء تمييز تعليق",
  VIP_GRANTED: "منح توثيق وتمييز",
  VIP_REVOKED: "سحب توثيق وتمييز",
};

function actionLabel(t: string): string {
  return ACTION_LABELS[t] ?? t;
}

/* ==================== أدوات العرض ==================== */

/** تحويل الأرقام إلى الشرقية للعرض الموحد الفاخر */
export function eastern(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** تنسيق التاريخ العربي — الميلادي بتوقيت القاهرة */
export function arabicDate(d: Date, withTime = false): string {
  try {
    const base = new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Cairo",
    }).format(d);
    if (!withTime) return base;
    const time = new Intl.DateTimeFormat("ar-EG", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Africa/Cairo",
    }).format(d);
    return `${base} — ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

/* ==================== أنواع البيانات ==================== */

export type PdfTrailEntry = {
  id: string;
  actorEmail: string;
  actorRole: string;
  actionCategory: string;
  actionType: string;
  targetEmail: string | null;
  reason: string | null;
  evidenceUrl: string | null;
  createdAt: Date;
};

export type PdfReportSummary = {
  hardDeletes: number;
  bans: number;
  featured: number;
  vipChanges: number;
  configChanges: number;
  total: number;
};

export type PdfReportInput = {
  entries: PdfTrailEntry[];
  summary: PdfReportSummary;
  range: { from: Date; to: Date; label: string };
  extractedBy: string;
  reportNo: string;
};

/* ==================== الأنماط ==================== */

const INK = "#1C1917";
const STEEL = "#57534E";
const GOLD = "#B45309";
const GOLD_SOFT = "#FEF3C7";
const NAVY = "#1E293B";
const LINE = "#E7E5E4";
const ZEBRA = "#FAFAF9";

const styles = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 64,
    paddingHorizontal: 40,
    backgroundColor: "#FFFFFF",
    fontFamily: "Tajawal",
    fontSize: 9.5,
    color: INK,
  },
  /* ---------- الترويسة السيادية الثابتة ---------- */
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 84,
    backgroundColor: NAVY,
    paddingHorizontal: 40,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 3,
    borderBottomColor: GOLD,
  },
  headerBrand: { flexDirection: "column" },
  headerTitle: {
    fontFamily: "Amiri",
    fontWeight: 700,
    fontSize: 17,
    color: "#FFFFFF",
  },
  headerSub: { fontSize: 8.5, color: "#CBD5E1", marginTop: 3 },
  headerBadge: {
    backgroundColor: GOLD,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBadgeText: { color: "#FFFFFF", fontSize: 8.5, fontWeight: 700 },
  /* ---------- التذييل الثابت ---------- */
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 46,
    paddingHorizontal: 40,
    backgroundColor: "#FAFAF9",
    borderTopWidth: 1,
    borderTopColor: LINE,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: STEEL },
  footerPage: { fontSize: 8, color: GOLD, fontWeight: 700 },
  /* ---------- بطاقة التعريف ---------- */
  metaCard: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: { width: "25%", paddingRight: 8, marginBottom: 2 },
  metaLabel: { fontSize: 7, color: STEEL, marginBottom: 2 },
  metaValue: { fontSize: 9.5, fontWeight: 700, color: INK },
  /* ---------- الملخص التنفيذي ---------- */
  sectionTitle: {
    fontFamily: "Amiri",
    fontWeight: 700,
    fontSize: 13,
    color: INK,
    marginTop: 16,
    marginBottom: 8,
    paddingRight: 8,
    borderRightWidth: 3,
    borderRightColor: GOLD,
    paddingBottom: 2,
  },
  summaryRow: { flexDirection: "row-reverse", gap: 8, marginTop: 2 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderTopWidth: 3,
    borderTopColor: GOLD,
    borderRadius: 6,
    backgroundColor: GOLD_SOFT,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  statNumber: { fontFamily: "Amiri", fontWeight: 700, fontSize: 19, color: INK },
  statLabel: { fontSize: 7.2, color: STEEL, marginTop: 3, textAlign: "center" },
  /* ---------- الجدول التفصيلي ---------- */
  tableHead: {
    flexDirection: "row-reverse",
    backgroundColor: NAVY,
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  th: { color: "#FFFFFF", fontSize: 8, fontWeight: 700 },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "flex-start",
  },
  rowZebra: { backgroundColor: ZEBRA },
  cell: { fontSize: 8, color: INK, lineHeight: 1.45 },
  cellDim: { fontSize: 7.4, color: STEEL },
  chip: {
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  chipText: { color: "#FFFFFF", fontSize: 7, fontWeight: 700 },
  evidenceLink: { fontSize: 6.8, color: "#0369A1" },
  reasonText: { fontSize: 7.6, color: INK, lineHeight: 1.5 },
});

/* عرض أعمدة الجدول (مجموعها 100) */
const COL = { date: 15, actor: 17, action: 15, target: 14, reason: 26, evidence: 13 };

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function StatBox({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statNumber}>{eastern(n)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ==================== الوثيقة ==================== */

export function AuditReportPDF({
  entries,
  summary,
  range,
  extractedBy,
  reportNo,
}: PdfReportInput) {
  const extractedAt = new Date();
  return (
    <Document
      title="التقرير الرقابي السيادي — كلام له لازمة"
      author="منصة كلام له لازمة"
      subject="سجل التدقيق والامتثال"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* الترويسة السيادية */}
        <View style={styles.header} fixed>
          <View style={styles.headerBrand}>
            <Text style={styles.headerTitle}>كلام له لازمة</Text>
            <Text style={styles.headerSub}>
              التقرير الرقابي السيادي — سجل التدقيق والامتثال (Master Audit &amp; Compliance Ledger)
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>وثيقة امتثال داخلية</Text>
          </View>
        </View>

        {/* بطاقة التعريف */}
        <View style={styles.metaCard}>
          <MetaItem label="رقم التقرير" value={reportNo} />
          <MetaItem label="نطاق التقرير" value={range.label} />
          <MetaItem label="تاريخ الاستخراج" value={arabicDate(extractedAt, true)} />
          <MetaItem label="المستخرج" value={extractedBy} />
        </View>

        {/* الملخص التنفيذي */}
        <Text style={styles.sectionTitle}>الملخص التنفيذي</Text>
        <View style={styles.summaryRow}>
          <StatBox n={summary.hardDeletes} label="محو حسابات شامل" />
          <StatBox n={summary.bans} label="حظر حسابات" />
          <StatBox n={summary.featured} label="تمييز تعليقات" />
          <StatBox n={summary.vipChanges} label="توثيق ورُتب" />
          <StatBox n={summary.configChanges} label="تعديلات إعدادات" />
        </View>

        {/* الجدول التفصيلي */}
        <Text style={styles.sectionTitle}>
          سجل العمليات التفصيلي ({eastern(summary.total)} قيدًا رقابيًا)
        </Text>

        <View style={styles.tableHead} fixed>
          <Text style={[styles.th, { width: `${COL.date}%` }]}>التاريخ</Text>
          <Text style={[styles.th, { width: `${COL.actor}%` }]}>الفاعل</Text>
          <Text style={[styles.th, { width: `${COL.action}%` }]}>الإجراء والتصنيف</Text>
          <Text style={[styles.th, { width: `${COL.target}%` }]}>المستهدف</Text>
          <Text style={[styles.th, { width: `${COL.reason}%` }]}>السبب</Text>
          <Text style={[styles.th, { width: `${COL.evidence}%` }]}>الدليل</Text>
        </View>

        {entries.map((e, i) => (
          <View key={e.id} style={[styles.row, ...(i % 2 === 1 ? [styles.rowZebra] : [])]}>
            <View style={{ width: `${COL.date}%` }}>
              <Text style={styles.cell}>{arabicDate(new Date(e.createdAt))}</Text>
              <Text style={styles.cellDim}>
                {new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(e.createdAt))}
              </Text>
            </View>
            <View style={{ width: `${COL.actor}%` }}>
              <Text style={styles.cell}>{e.actorEmail}</Text>
              <Text style={styles.cellDim}>{e.actorRole}</Text>
            </View>
            <View style={{ width: `${COL.action}%` }}>
              <View
                style={[
                  styles.chip,
                  { backgroundColor: CATEGORY_COLORS[e.actionCategory] ?? STEEL },
                ]}
              >
                <Text style={styles.chipText}>
                  {CATEGORY_LABELS[e.actionCategory] ?? e.actionCategory}
                </Text>
              </View>
              <Text style={[styles.cell, { marginTop: 3, fontWeight: 700 }]}>
                {actionLabel(e.actionType)}
              </Text>
            </View>
            <View style={{ width: `${COL.target}%` }}>
              <Text style={styles.cell}>{e.targetEmail ?? "—"}</Text>
            </View>
            <View style={{ width: `${COL.reason}%` }}>
              <Text style={styles.reasonText}>{e.reason ?? "—"}</Text>
            </View>
            <View style={{ width: `${COL.evidence}%` }}>
              {e.evidenceUrl ? (
                <Text style={styles.evidenceLink}>رابط الدليل ↗</Text>
              ) : (
                <Text style={styles.cellDim}>—</Text>
              )}
            </View>
          </View>
        ))}

        {entries.length === 0 && (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={styles.cellDim}>
              لا قيود رقابية في النطاق الزمني المحدد — سلامة كاملة بلا إجراءات حساسة.
            </Text>
          </View>
        )}

        {/* حاشية الإفصاح */}
        <View
          style={{
            marginTop: 18,
            borderWidth: 1,
            borderColor: LINE,
            borderRadius: 6,
            backgroundColor: ZEBRA,
            padding: 10,
          }}
        >
          <Text style={[styles.cellDim, { lineHeight: 1.7 }]}>
            يُعد هذا التقرير آلية وقوفًا مستقلة ناتجة برمجيًا من «السجل السيادي غير القابل للتلاعب» لحظة
            استخراجه، ويلتزم بمنح الامتثال غير المعرّف: القيود بعد محو الحسابات لا تحمل هوية أصحابها. روابط
            الأدلة محفوظة في مجلد الأدلة المحمي، وتُفتح عبر شاشة السجل السيادي أو بتاريخ القيد نفسه.
          </Text>
        </View>

        {/* التذييل الثابت */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            كلام له لازمة — وثيقة داخلية سرية لأصحاب المنصة، لا تُنشر ولا تُشارك.
          </Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `صفحة ${eastern(pageNumber)} من ${eastern(totalPages)}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** توليد التقرير كـBuffer جاهز للتحميل أو الرفع السحابي */
export async function renderAuditReportPdf(input: PdfReportInput): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<AuditReportPDF {...input} />);
}
