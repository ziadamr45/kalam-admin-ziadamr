/**
 * مخططات أدوات MCP السيادية — «كلام له لازمة»
 * تعريفات نقية (بيانات فقط) تفهمها نماذج Gemini تلقائيًا عبر MCP:
 * كل أداة لها اسم واضح ووصف عربي دقيق ومخطط JSON Schema صارم للمدخلات.
 */

export type McpToolSchema = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const MCP_SERVER_NAME = "kalam-sovereign-admin";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_TOOLS: McpToolSchema[] = [
  /* ==================== أ) أدوات المقالات ==================== */
  {
    name: "list_articles",
    description:
      "جلب قائمة المقالات مع فلترة حسب الحالة (DRAFT مسودة | SCHEDULED مجدول | PUBLISHED منشور | ARCHIVED مؤرشف) وترتيب حسب الأحدث أو الأكثر قراءة، مع إحصاءات المشاهدات لكل مقال.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"],
          description: "فلترة بحالة المقال — تُترك فارغة لجلب كل الحالات",
        },
        sectionSlug: { type: "string", description: "فلترة بمعرف القسم (slug)" },
        query: { type: "string", description: "بحث نصي في عناوين المقالات" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 20، أقصى 50)" },
        offset: { type: "number", description: "إزاحة الترقيم للصفحات (افتراضي 0)" },
        sort: {
          type: "string",
          enum: ["recent", "views", "published"],
          description: "الترتيب: recent الأحدث تحديثًا (افتراضي) | views الأكثر قراءة | published الأحدث نشرًا",
        },
      },
    },
  },
  {
    name: "get_article_details",
    description:
      "جلب تفاصيل مقال كامل بمتنه الكامل (Markdown) وملخصه وقسمه وغلافه وحالة صوته وإحصاءات تعليقاته وتفاعلاته ومشاهداته — عبر المعرف id أو الـ slug.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال الفريد (id)" },
        slug: { type: "string", description: "بديل عن id — معرف المقال النصي slug" },
      },
    },
  },
  {
    name: "create_article",
    description:
      "إنشاء مقال جديد مباشرة: العنوان والمحتوى بتنسيق Markdown والملخص (يُشتق آليًا إن غاب) والقسم والحالة ومعرف slug اختياري. التصنيف في المنصة يتم عبر الأقسام (section) — لا يوجد جدول وسوم منفصل. النشر المباشر قد يتطلب تأكيد قائمة الفحص الأخلاقي حسب إعدادات المنصة.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "عنوان المقال — إلزامي" },
        content: { type: "string", description: "متن المقال بتنسيق Markdown — إلزامي" },
        summary: { type: "string", description: "ملخص المقال — يُشتق آليًا من أول المتن إن غاب" },
        sectionSlug: { type: "string", description: "معرف القسم slug (مثل zawaya-ruya)" },
        status: {
          type: "string",
          enum: ["DRAFT", "SCHEDULED", "PUBLISHED"],
          description: "الحالة الابتدائية — افتراضي DRAFT مسودة",
        },
        slug: { type: "string", description: "معرف URL نصي — يُشتق من العنوان إن غاب" },
        tashkeelEnabled: { type: "boolean", description: "تفعيل عرض التشكيل (افتراضي true)" },
        authorIntent: { type: "string", description: "التغذية الفكرية السرية لرفيق النقاش — لا تُنشر للجمهور" },
        scheduledAt: { type: "string", description: "موعد النشر ISO-8601 — إلزامي مع SCHEDULED" },
        checklistConfirmation: {
          type: "boolean",
          description: "إقرار من الأدمن بتجاوز قائمة الفحص الأخلاقي — مطلوب للنشر المباشر عند تفعيل REQUIRE_CHECKLIST",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_article",
    description:
      "تعديل أي حقل لمقال قائم: النص أو العنوان أو الملخص أو القسم أو حالة النشر أو الغلاف أو التشكيل — يُعاد حساب وقت القراءة آليًا وتُعاد ترندرة صفحات المنصة فورًا عند تغير النشر.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        title: { type: "string", description: "عنوان جديد" },
        summary: { type: "string", description: "ملخص جديد" },
        content: { type: "string", description: "متن جديد بـ Markdown" },
        slug: { type: "string", description: "معرف URL جديد" },
        sectionSlug: { type: "string", description: "نقل المقال لقسم آخر عبر slug" },
        status: {
          type: "string",
          enum: ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"],
          description: "تغيير حالة النشر",
        },
        scheduledAt: { type: "string", description: "موعد النشر ISO-8601 عند SCHEDULED" },
        coverImage: { type: "string", description: "رابط صورة الغلاف الجديد" },
        tashkeelEnabled: { type: "boolean", description: "تفعيل/تعطيل التشكيل لهذا المقال" },
        authorIntent: { type: "string", description: "تحديث التغذية الفكرية السرية" },
        checklistConfirmation: { type: "boolean", description: "إقرار قائمة الفحص الأخلاقي للنشر" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_or_archive_article",
    description:
      "أرشفة المقال (يبقى محفوظًا ويختفي من المنصة العامة) أو نقله للحذف النهائي مع تنظيف أصوله الصوتية السحابية. الوضع الافتراضي الأرشفة الآمنة.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        mode: {
          type: "string",
          enum: ["archive", "delete"],
          description: "archive أرشفة (افتراضي آمن) | delete حذف نهائي غير قابل للتراجع",
        },
      },
      required: ["id"],
    },
  },

  /* ==================== ب) أدوات الأقسام ==================== */
  {
    name: "list_categories",
    description:
      "جلب جميع أقسام المنصة مع وصفها وألوانها وأيقوناتها وعدد مقالات كل قسم وحالتها.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_category",
    description: "إضافة قسم (تصنيف) جديد يظهر مباشرة في قائمة الأقسام العامة للمنصة.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم القسم — إلزامي" },
        slug: { type: "string", description: "معرف URL — يُشتق من الاسم إن غاب" },
        description: { type: "string", description: "وصف القسم" },
        color: { type: "string", description: "لون هوية القسم بصيغة hex مثل #A16A1F" },
        icon: { type: "string", description: "أيقونة القسم — رمز نصي أو إيموجي" },
        sortOrder: { type: "number", description: "ترتيب العرض" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_category",
    description: "تعديل بيانات قسم قائم: الاسم أو الوصف أو اللون أو الأيقونة أو الترتيب أو الإيقاف/التفعيل.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف القسم — إلزامي" },
        name: { type: "string", description: "اسم جديد" },
        description: { type: "string", description: "وصف جديد" },
        color: { type: "string", description: "لون hex جديد" },
        icon: { type: "string", description: "أيقونة جديدة" },
        sortOrder: { type: "number", description: "ترتيب جديد" },
        active: { type: "boolean", description: "تفعيل أو إيقاف ظهور القسم" },
      },
      required: ["id"],
    },
  },

  /* ==================== جـ) أدوات الوسائط والصوت ==================== */
  {
    name: "trigger_audio_generation",
    description:
      "إطلاق مهمة التوليد الصوتي الخلفية لمقال محدد: تحجز المهمة في قاعدة البيانات (audioStatus = PROCESSING) وتشعل سلسلة معالجة ذاتية التغذية تولّد المقاطع الصوتية خلفيًا عبر Gemini TTS وترفع الملف المدمج إلى Cloudinary ثم تصبح READY — دون الحاجة لبقاء أي عميل متصل.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        resume: {
          type: "boolean",
          description: "استئناف مهمة معلقة بدل رفضها — استخدمه إذا بدت المعالجة متوقفة",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_article_cover",
    description: "تحديث رابط صورة غلاف المقال بعد توليده أو رفعه (تُعاد ترندرة صفحة المقال فورًا).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        coverImage: {
          type: "string",
          description: "الرابط الجديد للغلاف — مرّر null لمسح الغلاف الحالي",
        },
      },
      required: ["id", "coverImage"],
    },
  },

  /* ==================== د) التحليلات والرقابة ==================== */
  {
    name: "get_system_analytics",
    description:
      "ملخص فوري شامل: إجمالي المقالات بحالاتها ومشاهداتها وقراءاتها المكتملة، الزيارات، حالة التعليقات، عدد المستخدمين، واستهلاك حصص نقاش الذكاء الاصطناعي (AiDiscussionUsage) وأكثر المقالات قراءة.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_and_moderate_comments",
    description:
      "جلب التعليقات المعلقة أو المخالِفة (مع بيانات كاتبها ومقالها) واتخاذ قرار رقابي: اعتماد التعليق أو رفضه أو حذفه نهائيًا حفاظًا على القيم الإسلامية وفلسفة المنصة — تُحدّث صفحة المقال فورًا بعد القرار.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "approve", "reject", "delete"],
          description: "list جلب | approve اعتماد | reject رفض | delete حذف نهائي",
        },
        commentId: { type: "string", description: "معرف التعليق — إلزامي لكل الأفعال عدا list" },
        status: {
          type: "string",
          enum: ["PENDING", "APPROVED", "REJECTED"],
          description: "فلترة قائمة الجلب بالحالة — افتراضي PENDING المعلقة",
        },
        flaggedOnly: { type: "boolean", description: "إظهار المبلّغ عنها آليًا فقط" },
        limit: { type: "number", description: "عدد نتائج الجلب (افتراضي 20، أقصى 50)" },
      },
      required: ["action"],
    },
  },

  /* ==================== هـ) إدارة الكاش ==================== */
  {
    name: "purge_site_cache",
    description:
      "إطلاق إعادة التحقق الفوري (revalidatePath) لأي مسارات في المنصة العامة لضمان ظهور التعديلات للمستخدمين لحظة صدور الأمر — استخدم ['/'] لإعادة توليد الرئيسية، أو مسار مقال محدد /article/<slug>، أو مرّر layout=true لتحديث القوائم الجانبية في كل الصفحات.",
    inputSchema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "قائمة المسارات مثل ['/'] أو ['/article/slug','/section/x'] — إلزامي",
        },
        slug: { type: "string", description: "slug مقال مرافق لتحديث تذييلات الوسوم" },
        layout: { type: "boolean", description: "إعادة تحقق على مستوى التخطيط المشترك كلّه" },
      },
      required: ["paths"],
    },
  },
];
