/* اختبار محرك التقرير الرقابي — توليد PDF عيني والتحقق البصري من العربية */
import { renderAuditReportPdf, type PdfTrailEntry } from "../src/lib/audit-pdf";

const entries: PdfTrailEntry[] = [
  {
    id: "clx1",
    actorEmail: "ziad90216@gmail.com",
    actorRole: "OWNER",
    actionCategory: "ADMIN_MODERATION",
    actionType: "USER_HARD_DELETE",
    targetEmail: "abuser@example.com",
    reason: "[إساءة وتعدٍّ أمني] محاولات متكررة لاختراق حسابات القراء — موثقة بلقطات الشاشة المرفوعة",
    evidenceUrl: "https://res.cloudinary.com/demo/image/upload/kalam/evidence/shot-1.png",
    createdAt: new Date("2026-09-08T14:30:00Z"),
  },
  {
    id: "clx2",
    actorEmail: "user-self",
    actorRole: "USER",
    actionCategory: "USER_SELF_ACTION",
    actionType: "USER_SELF_HARD_DELETE",
    targetEmail: "reader@google.mail",
    reason: "طلب حذف ذاتي فوري من صفحة الملف الشخصي — محو برمجي شامل بلا استبقاء",
    evidenceUrl: null,
    createdAt: new Date("2026-09-06T09:12:00Z"),
  },
  {
    id: "clx3",
    actorEmail: "moderator@kalam",
    actorRole: "ADMIN",
    actionCategory: "ADMIN_MODERATION",
    actionType: "COMMENT_FEATURED",
    targetEmail: "writer123",
    reason: "تعليق يثري الحوار ويستحق الظهور في المقدمة",
    evidenceUrl: null,
    createdAt: new Date("2026-09-05T18:45:00Z"),
  },
  {
    id: "clx4",
    actorEmail: "gemini-spark",
    actorRole: "SYSTEM",
    actionCategory: "ADMIN_VIP_CHANGE",
    actionType: "VIP_GRANTED",
    targetEmail: "elite.writer@kalam",
    reason: "عضو أهل الكلمة — بلوغ 350 نقطة أثر تلقائيًا",
    evidenceUrl: null,
    createdAt: new Date("2026-09-04T11:05:00Z"),
  },
];

async function main() {
  const buf = await renderAuditReportPdf({
    entries,
    summary: { hardDeletes: 2, bans: 5, featured: 14, vipChanges: 3, configChanges: 1, total: 4 },
    range: { from: new Date("2026-09-01"), to: new Date("2026-09-10"), label: "مخصص: ١ – ١٠ سبتمبر ٢٠٢٦" },
    extractedBy: "ziad90216@gmail.com (OWNER)",
    reportNo: "AUD-٢٠٢٦٠٩١٠-TEST",
  });
  const { writeFileSync } = await import("fs");
  writeFileSync("/home/z/my-project/scripts/audit-pdf-sample.pdf", buf);
  console.log("OK — bytes:", buf.length);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
