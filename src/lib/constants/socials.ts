/**
 * ============================================================
 * مصفوفة الروابط الرسمية المعتمدة — مصدر الحقيقة الموحد
 * لكل روابط التواصل الاجتماعي والهوية الرقمية في الموقعين
 * ============================================================
 * القيم هنا هي الافتراضيات الرسمية، ويُستبدل كافة الروابط القديمة
 * أو المعطلة بها في: تذييل الموقع، صفحة اتصل بنا، بطاقة الكاتب
 * والملف الشخصي، ولوحة الأدمن (الشريط الجانبي/التذييل).
 *
 * التوحد مع التكوين السيادي: الأدمن يستطيع تجاوز أي مفتاح لحظيًا
 * بمفاتيح social.<key> في جدول SiteConfig — من استوديو التكوين،
 * أو التيرمينال السيادي (config set social.whatsapp ..)، أو MCP.
 * الحفظ يستدعي revalidateTag('site-config') + revalidatePath('/', 'layout')
 * فتظهر الروابط الجديدة لكل الزوار فورًا بلا إعادة نشر.
 */

export type SocialKey =
  | "facebook"
  | "whatsapp"
  | "telegram"
  | "email"
  | "youtube"
  | "instagram"
  | "threads"
  | "x"
  | "tiktok"
  | "snapchat"
  | "devto"
  | "portfolio"
  | "github"
  | "linkedin";

export const SOCIAL_KEYS = [
  "facebook",
  "whatsapp",
  "telegram",
  "email",
  "youtube",
  "instagram",
  "threads",
  "x",
  "tiktok",
  "snapchat",
  "devto",
  "portfolio",
  "github",
  "linkedin",
] as SocialKey[];

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  facebook: "فيسبوك",
  whatsapp: "واتساب",
  telegram: "تليجرام",
  email: "البريد الإلكتروني",
  youtube: "يوتيوب",
  instagram: "إنستجرام",
  threads: "ثريدز",
  x: "إكس",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  devto: "dev.to",
  portfolio: "الموقع الشخصي",
  github: "جيت هاب",
  linkedin: "لينكد إن",
};

/** الحزمة الرسمية المعتمدة — كل منصات صاحب المنصة في مكان واحد */
export const SOCIAL_LINKS: Record<SocialKey, string> = {
  facebook: "https://www.facebook.com/ziadamr.me",
  whatsapp: "https://wa.me/+201152978155",
  telegram: "https://t.me/ziadamr",
  email: "mailto:ziad90216@gmail.com",
  youtube: "https://youtube.com/@alhayat_ala_eltarek?si=pcsc_31Kcv3Jym14",
  instagram: "https://www.instagram.com/ziadamr.me/",
  threads: "https://www.threads.com/@ziadamr.me",
  x: "https://x.com/ziadamrme",
  tiktok: "https://vm.tiktok.com/ZS9rjN7J3b6WU-LATna/",
  snapchat: "https://www.snapchat.com/add/ziad7mr?share_id=bQA1QOucAd8&locale=ar-EG",
  devto: "https://dev.to/ziad_amr_0e76916f10a8563a",
  portfolio: "https://ziadamrme.vercel.app",
  github: "https://github.com/ziadamr45",
  linkedin:
    "https://www.linkedin.com/in/ziad-amr-44633a411?utm_source=share_via&utm_content=profile&utm_medium=member_android",
};

/** مفتاح التكوين السيادي المقابل — social.<key> */
export function socialConfigKey(key: SocialKey): string {
  return `social.${key}`;
}
