/**
 * مخططات أدوات MCP السيادية — «كلام له لازمة»
 * تعريفات نقية (بيانات فقط) تفهمها نماذج Gemini تلقائيًا عبر MCP:
 * كل أداة لها اسم واضح ووصف عربي دقيق ومخطط JSON Schema صارم للمدخلات.
 */

export type McpToolSchema = {
  name: string;
  description: string;
  /** العنوان العربي المعروض في واجهات العملاء — يبدأ باسم القسم للترتيب البصري */
  title?: string;
  /**
   * حقل بروتوكول MCP الرسمي الذي يصنّف الأداة لواجهات العملاء:
   * readOnlyHint=true تظهر في قسم «قراءة»، والكتابة الآمنة في «كتابة»،
   * وdestructiveHint=true (حذف نهائي أو عملية خطرة) في «كتابة / حذف».
   * بلا هذا الحقل يعامل العملاء الأداة افتراضيًا ككتابة/حذف!
   */
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const MCP_PROTOCOL_VERSION = "2025-03-26";
/* الاسم القصير — نفسه عنوان المنشن في واجهات العملاء (Gemini يستخدمه في @mention) */
export const MCP_SERVER_NAME = "كلام له لازمة";
export const MCP_SERVER_VERSION = "5.2.0";

export const MCP_TOOLS: McpToolSchema[] = [
  /* ==================== أ) أدوات المقالات ==================== */
  {
    name: "list_articles",
    title: "[المقالات] استعراض قائمة المقالات",
    annotations: {title: "[المقالات] استعراض قائمة المقالات", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
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
    title: "[المقالات] تفاصيل مقال كامل",
    annotations: {title: "[المقالات] تفاصيل مقال كامل", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
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
    title: "[المقالات] إنشاء مقال جديد",
    annotations: {title: "[المقالات] إنشاء مقال جديد", readOnlyHint: false, destructiveHint: false},
    description:
      "إنشاء مقال جديد مباشرة: العنوان والمحتوى بتنسيق Markdown والملخص (يُشتق آليًا إن غاب) والقسم والحالة ومعرف slug اختياري. التصنيف في المنصة يتم عبر الأقسام (section) — لا يوجد جدول وسوم منفصل. النشر المباشر قد يتطلب تأكيد قائمة الفحص الأخلاقي حسب إعدادات المنصة.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "عنوان المقال — إلزامي" },
        content: { type: "string", description: "متن المقال بتنسيق Markdown — إلزامي" },
        contentWithTashkeel: {
          type: "string",
          description: "النسخة المشكولة كاملة من المتن (بالتشكيل والتنوين) — تُحفظ كما هي وتُعرض عند تفعيل مفتاح التشكيل؛ تُعتمد النسخة غير المشكولة افتراضيًا إن غابت",
        },
        coverImage: { type: "string", description: "رابط صورة الغلاف (Cloudinary أو رابط مباشر)" },
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
    title: "[المقالات] تعديل مقال قائم",
    annotations: {title: "[المقالات] تعديل مقال قائم", readOnlyHint: false, destructiveHint: false},
    description:
      "تعديل أي حقل لمقال قائم: النص أو العنوان أو الملخص أو القسم أو حالة النشر أو الغلاف أو التشكيل — يُعاد حساب وقت القراءة آليًا وتُعاد ترندرة صفحات المنصة فورًا عند تغير النشر.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        title: { type: "string", description: "عنوان جديد" },
        summary: { type: "string", description: "ملخص جديد" },
        content: { type: "string", description: "متن جديد بـ Markdown — إن لم تُمرّر نسخة مشكولة صريحة في نفس النداء فُيُستبدل المشكول بهذا المتن" },
        contentWithTashkeel: {
          type: ["string", "null"],
          description: "حقن/تحديث النسخة المشكولة كاملة صراحةً — لا تُسحق بمتن النداء؛ مرّر null صريحًا لإعادة الضبط على المتن غير المشكول",
        },
        commentsEnabled: {
          type: "boolean",
          description: "باب التعليق لهذا المقال تحديدًا — true يفتح وfalse يطوي حقل التعليقات لحظيًا دون نشر",
        },
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
    title: "[المقالات] أرشفة أو حذف نهائي لمقال",
    annotations: {title: "[المقالات] أرشفة أو حذف نهائي لمقال", readOnlyHint: false, destructiveHint: true},
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
    title: "[الأقسام] استعراض أقسام المنصة",
    annotations: {title: "[الأقسام] استعراض أقسام المنصة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "جلب جميع أقسام المنصة مع وصفها وألوانها وأيقوناتها وعدد مقالات كل قسم وحالتها.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_category",
    title: "[الأقسام] إنشاء قسم جديد",
    annotations: {title: "[الأقسام] إنشاء قسم جديد", readOnlyHint: false, destructiveHint: false},
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
    title: "[الأقسام] تعديل قسم قائم",
    annotations: {title: "[الأقسام] تعديل قسم قائم", readOnlyHint: false, destructiveHint: false},
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
    title: "[الصوت والوسائط] إطلاق التوليد الصوتي لمقال",
    annotations: {title: "[الصوت والوسائط] إطلاق التوليد الصوتي لمقال", readOnlyHint: false, destructiveHint: false},
    description:
      "إطلاق مهمة التوليد الصوتي الخلفية لمقال محدد: تحجز المهمة في قاعدة البيانات (audioStatus = PROCESSING) وتشعل سلسلة معالجة ذاتية التغذية تولّد المقاطع الصوتية خلفيًا عبر Gemini TTS وترفع الملف المدمج إلى Cloudinary ثم تصبح READY — دون الحاجة لبقاء أي عميل متصل، مع خيار اختيار صوت القارئ لهذه المهمة.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال — إلزامي" },
        resume: {
          type: "boolean",
          description: "استئناف مهمة معلقة بدل رفضها — استخدمه إذا بدت المعالجة متوقفة",
        },
        voice: {
          type: "string",
          description: "صوت القارئ من قائمة Gemini الرسمية (مثل Charon أو Sulafat أو Orus أو Kore) — يُحفظ على المقال ويُستخدم في كل المقاطع؛ افتراضيًا صوت البيئة Kore",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "manage_article_audio",
    title: "[الصوت والوسائط] إدارة صوت المقال والعينات الصوتية",
    annotations: {title: "[الصوت والوسائط] إدارة صوت المقال والعينات الصوتية", readOnlyHint: false, destructiveHint: true},
    description:
      "الإدارة الكاملة لصوت المقال: status للحالة اللحظية (التقدم done/total والصوت المختار والمدة والخطأ واكتشاف المهمة المعلقة stale مع شفائها الذاتي بضرب العامل)، set_voice لاختيار صوت القارئ (من قائمة Gemini الرسمية) يُطبق على التوليد القادم، start لإطلاق التوليد (مثل trigger_audio_generation مع دعم voice)، delete لإيقاف أي معالجة جارية وحذف الصوت من المقال وتنظيف ملفاته من Cloudinary كاملةً، وsample لعينة صوتية سريعة بأي صوت من الأصوات الثلاثين تُسمع فورًا قبل اعتماده (بلا مقال).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال أو slug — إلزامي لكل الأفعال عدا sample" },
        action: {
          type: "string",
          enum: ["status", "set_voice", "start", "delete", "sample"],
          description:
            "status الحالة اللحظية (افتراضي) | set_voice اختيار الصوت | start إطلاق التوليد | delete حذف الصوت وتنظيفه | sample عينة صوتية سريعة للاستماع إلى أي صوت قبل اعتماده",
        },
        voice: {
          type: "string",
          description: "مع set_voice وsample (واختياري مع start): صوت Gemini مثل Charon أو Sulafat أو Orus أو Kore",
        },
        text: { type: "string", description: "مع sample: الجملة المطلوب سماعها (اختياري — افتراضيًا جملة قصيرة مناسبة)" },
        resume: { type: "boolean", description: "مع start: استئناف مهمة معلقة بدل رفضها" },
      },
    },
  },
  {
    name: "tashkeel_and_validate_article",
    title: "[الصوت والوسائط] التشكيل الآلي وفحص تطابق الكتل",
    annotations: {title: "[الصوت والوسائط] التشكيل الآلي وفحص تطابق الكتل", readOnlyHint: false, destructiveHint: false},
    description:
      "محرك التشكيل الآلي الذكي وفحص تطابق الكتل: يولّد النسخة المشكولة كاملة من متن المقال عبر Gemini مع الحفاظ الحرفي على كتل المحتوى ([[آية|السورة|رقم الآية]]…[[/آية]] و[[حديث|…]]…[[/حديث]] وكتل :::quran و:::hadith و:::note و:::question و:::name) ووسوم ماركداون والروابط، مع تطبيق قاعدة التنوين الحتمية (التنوين فوق الحرف قبل ألف التنوين — عالمًا لا عالماً)، ثم يفحص تطابق عدد الكلمات وتسلسل الكتل بين النسختين لضمان عدم انزياح تظليل الكاريوكي الصوتي. action=validate يفحص النسخة المشكولة المحفوظة حاليًا دون تعديل، generate يولّد ويعيد النتيجة للمراجعة دون حفظ، save يولّد ويفحص ويحفظ على المقال مباشرة.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال أو slug — إلزامي" },
        action: {
          type: "string",
          enum: ["validate", "generate", "save"],
          description:
            "validate فحص تطابق النسخة المشكولة المحفوظة (افتراضي) | generate توليد نسخة مشكولة جديدة للمراجعة دون حفظ | save توليد وفحص وحفظ على المقال فورًا",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "generate_article_cover",
    title: "[الصوت والوسائط] توليد غلاف مقال بالذكاء الاصطناعي",
    annotations: {title: "[الصوت والوسائط] توليد غلاف مقال بالذكاء الاصطناعي", readOnlyHint: false, destructiveHint: false},
    description:
      "توليد غلاف المقال بالذكاء الاصطناعي كاملًا: يقرأ جوهر المقال ويصيغ برومبتًا فنيًا إنجليزيًا عبر Gemini (أو تعتمد برومبتًا مخصصًا تمرره)، ثم يرسم عبر سلسلة المحركات (Imagen → Gemini Image → Pollinations) ويرفع الناتج إلى Cloudinary ويربطه بالمقال مع إعادة ترندرة صفحاته — ووضع preview=true يعيد البرومبت الصيغ دون رسم لفحصه وتعديله قبل النفقة.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال أو slug — إلزامي" },
        prompt: {
          type: "string",
          description: "برومبت فني مخصص بالإنجليزية يُعتمد كما هو بدل الصياغة الآلية — اتركه فارغًا ليصوغ Gemini البرومبت من جوهر المقال",
        },
        preview: {
          type: "boolean",
          description: "true = إعادة البرومبت الصيغ فقط دون توليد الصورة (فحص الجودة والصياغة) — افتراضي false",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_article_cover",
    title: "[الصوت والوسائط] تحديث رابط غلاف المقال",
    annotations: {title: "[الصوت والوسائط] تحديث رابط غلاف المقال", readOnlyHint: false, destructiveHint: false},
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

  {
    name: "generate_quote_card",
    title: "[الصوت والوسائط] توليد بطاقة اقتباس مصورة",
    annotations: {title: "[الصوت والوسائط] توليد بطاقة اقتباس مصورة", readOnlyHint: false, destructiveHint: false},
    description:
      "توليد بطاقة اقتباس مصورة رسمية بهوية «كلام له لازمة» (نفس روح مولّد الاقتباسات في الموقع العام): نص الاقتباس بخط أميري المشكّل على خلفية داكنة بإطار ذهبي أو خلفية ورق فاتح، مع المصدر وشعار المنصة — تُرسم على الخادم بجودة كاملة وتُرفع إلى Cloudinary ويعاد الرابط الجاهز للنشر المباشر على فيسبوك أو حالات واتساب أو أي منصة.",
    inputSchema: {
      type: "object",
      properties: {
        quote: { type: "string", description: "نص الاقتباس — إلزامي (حتى 600 حرف)" },
        attribution: {
          type: "string",
          description: "سطر المصدر أسفل الاقتباس — مثل «صاحب المنصة» أو اسم الكتاب (افتراضي: كلام له لازمة)",
        },
        format: {
          type: "string",
          enum: ["square", "portrait", "story"],
          description:
            "square مربع 1080×1080 للمنشورات (افتراضي) | portrait عمودي 1080×1350 | story ستوري 1080×1920 لحالات واتساب والستوريات",
        },
        theme: {
          type: "string",
          enum: ["dark", "paper"],
          description: "dark الخلفية الداكنة الذهبية بهوية البطاقات الرسمية (افتراضي) | paper خلفية الورق الفاتح بهوية الموقع",
        },
      },
      required: ["quote"],
    },
  },

  /* ==================== د) التحليلات والرقابة ==================== */
  {
    name: "get_system_analytics",
    title: "[التحليلات والرقابة] الملخص التحليلي الشامل",
    annotations: {title: "[التحليلات والرقابة] الملخص التحليلي الشامل", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "ملخص فوري شامل: إجمالي المقالات بحالاتها ومشاهداتها وقراءاتها المكتملة، الزيارات، حالة التعليقات، عدد المستخدمين، واستهلاك حصص نقاش الذكاء الاصطناعي (AiDiscussionUsage) وأكثر المقالات قراءة.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_and_moderate_comments",
    title: "[التحليلات والرقابة] رقابة التعليقات واتخاذ القرار",
    annotations: {title: "[التحليلات والرقابة] رقابة التعليقات واتخاذ القرار", readOnlyHint: false, destructiveHint: true},
    description:
      "جلب التعليقات المعلقة أو المخالِفة (مع بيانات كاتبها ومقالها) واتخاذ قرار رقابي: اعتماد التعليق أو رفضه أو حذفه نهائيًا حفاظًا على القيم الإسلامية وفلسفة المنصة — تُحدّث صفحة المقال فورًا بعد القرار.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "approve", "reject", "delete", "list_reports", "clear_reports"],
          description:
            "list جلب | approve اعتماد | reject رفض | delete حذف نهائي | list_reports جلب البلاغات المرفقة بالتعليقات | clear_reports مسح بلاغات تعليق",
        },
        commentId: { type: "string", description: "معرف التعليق — إلزامي لكل الأفعال عدا list وlist_reports" },
        dismissFlag: {
          type: "boolean",
          description: "مع clear_reports — مسح علامة الاشتباه الآلي (flagged) عن التعليق أيضًا",
        },
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
  {
    name: "post_official_comment",
    title: "[التحليلات والرقابة] نشر تعليق رسمي باسم صاحب المنصة",
    annotations: {title: "[التحليلات والرقابة] نشر تعليق رسمي باسم صاحب المنصة", readOnlyHint: false, destructiveHint: false},
    description:
      "نشر تعليق رسمي فوري باسم صاحب المنصة الموثق (OWNER) على أي مقال منشور — يُعتمد APPROVED لحظته وتُعاد ترندرة صفحة المقال، مع خيار تثبيته ذاتيًا (selfPin — يفك تثبيت تعليق المالك السابق في المقال) أو تمييزه فكريًا ملهمًا (inspire — +نقاط أثر وثبوت أعلى المقال)، وإرسال إشعار COMMENT_REPLY للمشاركين في نقاش المقال.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال أو slug — إلزامي (التعليق على المنشور فقط)" },
        content: { type: "string", description: "نص التعليق الرسمي — إلزامي (حتى 4000 حرف)" },
        selfPin: {
          type: "boolean",
          description: "تثبيت التعليق أعلى الحوار بأسلوب التثبيت الذاتي — يفك تثبيت تعليق المالك السابق في المقال نفسه",
        },
        inspire: {
          type: "boolean",
          description: "تمييز التعليق «تعليقًا فكريًا ملهمًا» بنفس مسار الأداة الرسمية — نقاط أثر وثبوت أعلى المقال",
        },
      },
      required: ["id", "content"],
    },
  },
  {
    name: "test_article_ai_discuss",
    title: "[التحليلات والرقابة] اختبار المحاور الذكي على مقال",
    annotations: {title: "[التحليلات والرقابة] اختبار المحاور الذكي على مقال", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "اختبار المحاور الذكي على أي مقال حتى وهو مسودة (DRAFT) — محاكاة دقيقة لمسار /api/ai/discuss على الموقع العام: نفس برومبت النظام الحاكم ونفس حقن التغذية الفكرية السرية (authorIntent) التي لا تُعاد في أي استجابة، مع سجل حوار اختياري — لقياس جودة ردود المحاور قبل النشر دون انتظار ودون حساب على حصص أي قارئ.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف المقال أو slug — إلزامي (يعمل على كل الحالات حتى DRAFT)" },
        message: {
          type: "string",
          description: "سؤال الاختبار (حتى 1200 حرف) — يُترك فارغًا لسؤال جاهز: «ما الجوهر الذي يقف عليه هذا المقال؟ ناقش أقوى نقطة فيه وأضعفها بصراحة.»",
        },
        history: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "model"] },
              text: { type: "string" },
            },
            required: ["role", "text"],
          },
          description: "سجل حوار تراكمي اختياري [{ role: user|model, text }] لمحاكاة نقاش متعدد الأدوار",
        },
      },
      required: ["id"],
    },
  },

  /* ==================== هـ) إدارة الكاش ==================== */
  {
    name: "purge_site_cache",
    title: "[الكاش والنشر] إعادة تحقق فوري لمسارات المنصة",
    annotations: {title: "[الكاش والنشر] إعادة تحقق فوري لمسارات المنصة", readOnlyHint: false, destructiveHint: false},
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

  /* ==================== و) المستخدمون والقراء ==================== */
  {
    name: "list_users",
    title: "[القراء] استعراض القراء المسجلين",
    annotations: {title: "[القراء] استعراض القراء المسجلين", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "جلب القراء المسجلين مرتبين برصيد الأثر: الاسم المعروض والاسم الأصلي والبريد والرتبة الفكرية ورصيد الأثر وحالة الحظر وسببها وعدد تعليقاتهم وجلسات نقاشهم — مع بحث نصي وفلترة المحظورين.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "بحث في الاسم المعروض أو الأصلي أو البريد" },
        bannedOnly: { type: "boolean", description: "إظهار المحظورين فقط" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 30، أقصى 100)" },
        offset: { type: "number", description: "إزاحة الترقيم للصفحات" },
      },
    },
  },
  {
    name: "manage_user",
    title: "[القراء] السيادة الكاملة على حساب قارئ",
    annotations: {title: "[القراء] السيادة الكاملة على حساب قارئ", readOnlyHint: false, destructiveHint: true},
    description:
      "السيادة الكاملة على حساب قارئ (بمعرف userId أو بريد email): حظره نهائيًا بسبب موثق أو فك حظره، منح/خصم رصيد أثر، تصفير هويته المخصصة عائدًا إياه لحالة Google الأصلية، تعديل بطاقته الفكرية كاملةً (الاسم المعروض والصورة والنبذة والنبذة الموسعة وروابط التواصل الموثقة)، فحص أجهزته المسجلة وإبطال جهاز بعينه، وفحص دخولات Google وجلساته وإبطالها، وتصفير تجربة التهيئة لمعاينة شرائح الترحيب المعدلة، وعرض/تعديل تفضيلات إشعاراته، وجرد مواضع قراءته وضبطها أو تصفيرها.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "معرف المستخدم — أو مرر email بدلًا منه" },
        email: { type: "string", description: "بريد المستخدم — بديل عن userId" },
        action: {
          type: "string",
          enum: [
            "ban",
            "unban",
            "adjust_impact",
            "reset_identity",
            "update_identity",
            "list_devices",
            "revoke_device",
            "list_logins",
            "revoke_logins",
            "reset_onboarding",
            "get_prefs",
            "set_prefs",
            "list_reading",
            "set_reading",
            "reset_reading",
          ],
          description:
            "ban حظر | unban فك الحظر | adjust_impact منح/خصم أثر | reset_identity تصفير الهوية المخصصة | update_identity تعديل البطاقة الفكرية (الاسم/الصورة/النبذة/الموسعة/الروابط) | list_devices جرد أجهزة القارئ | revoke_device إبطال جهاز بعينه | list_logins فحص دخولات Google وجلساته | revoke_logins إبطال جلساته وإجباره على إعادة الدخول | reset_onboarding تصفير تجربة التهيئة (يشاهد شرائح الترحيب من جديد) | get_prefs عرض تفضيلات الإشعارات | set_prefs تعديلها | list_reading جرد مواضع قراءته | set_reading ضبط موضع قراءة مقال | reset_reading تصفير مواضع القراءة (مقال أو الكل)",
        },
        reason: {
          type: "string",
          description: "السبب الموثق — إلزامي مع ban وadjust_impact (يُسجل في سجل الأثر/التدقيق)",
        },
        delta: {
          type: "number",
          description: "عدد النقاط مع adjust_impact — موجبة للمنح وسالبة للخصم (±1 إلى ±5000)",
        },
        customName: {
          type: ["string", "null"],
          description: "مع update_identity: الاسم المعروض الجديد — null لمسحه واسترجاع اسم Google",
        },
        customImage: {
          type: ["string", "null"],
          description: "مع update_identity: رابط صورة https أو data:image — null لمسحها",
        },
        bio: {
          type: ["string", "null"],
          description: "مع update_identity: النبذة القصيرة — null لمسحها (حتى 5000 حرف)",
        },
        extendedBio: {
          type: ["string", "null"],
          description: "مع update_identity: النبذة الموسعة للبطاقة الفكرية للموثقين والنخبة — null لمسحها",
        },
        verifiedSocialLinks: {
          type: ["object", "null"],
          description: "مع update_identity: روابط التواصل في البطاقة الفكرية — كائن مثل {\"website\":\"https://…\",\"x\":\"https://…\",\"telegram\":\"https://…\"} أو null لمسحها (القيم https فقط)",
        },
        deviceId: { type: "string", description: "معرف الجهاز مع revoke_device — من list_devices" },
        limit: { type: "number", description: "عدد الأجهزة مع list_devices (افتراضي 20، أقصى 50)" },
        prefs: {
          type: "object",
          description:
            'مع set_prefs: التفضيلات الجديدة مثل {"pushNewArticles":true,"impactAndReplies":false} — المفاتيح المقبولة pushNewArticles وimpactAndReplies فقط',
        },
        articleId: {
          type: "string",
          description: "معرف المقال أو slug — إلزامي مع set_reading، ومع reset_reading يقصر التصفير على مقال واحد (بدونه تُمسح كل المواضع)",
        },
        progress: { type: "number", description: "مع set_reading: نسبة التقدم 0-100 (افتراضي 0)" },
        scrollY: { type: "number", description: "مع set_reading: موضع التمرير بالبكسل (افتراضي 0)" },
      },
      required: ["action"],
    },
  },

  /* ==================== ز) القنوات الخاصة والحوكمة ==================== */
  {
    name: "list_and_handle_proposals",
    title: "[القنوات الخاصة والحوكمة] قناة أهل الكلمة",
    annotations: {title: "[القنوات الخاصة والحوكمة] قناة أهل الكلمة", readOnlyHint: false, destructiveHint: false},
    description:
      "قناة «أهل الكلمة» الخاصة: جلب المقترحات الفكرية الواردة مباشرة من أصحاب أعلى رتبة فكرية (مع بيانات كاتبها ورتبته ورصيده) وتعليم المقترح مُعالَجًا أو إعادة فتحه.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "handle", "reopen"],
          description: "list جلب (افتراضي) | handle تعليم مُعالَجًا | reopen إعادة فتح",
        },
        id: { type: "string", description: "معرف المقترح — إلزامي مع handle وreopen" },
        limit: { type: "number", description: "عدد نتائج الجلب (افتراضي 30، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_contact_messages",
    title: "[القنوات الخاصة والحوكمة] صندوق اتصل بنا",
    annotations: {title: "[القنوات الخاصة والحوكمة] صندوق اتصل بنا", readOnlyHint: false, destructiveHint: true},
    description:
      "صندوق «اتصل بنا»: جلب رسائل الزوار (غير المقروءة أولًا) ببيانات مرسليها، وتعليمها مقروءة أو غير مقروءة، أو أرشفتها واسترجاعها، أو حذفها نهائيًا.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "mark_read", "mark_unread", "archive", "unarchive", "delete"],
          description: "list جلب (افتراضي) | بقية الأفعال تتطلب id الرسالة",
        },
        id: { type: "string", description: "معرف الرسالة — إلزامي لكل الأفعال عدا list" },
        archived: {
          type: "boolean",
          description: "فلتر قائمة الجلب: true المؤرشفة فقط | false غير المؤرشفة فقط | احذفه للكل",
        },
        limit: { type: "number", description: "عدد نتائج الجلب (افتراضي 30، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_legal_pages",
    title: "[القنوات الخاصة والحوكمة] تحرير الصفحات القانونية",
    annotations: {title: "[القنوات الخاصة والحوكمة] تحرير الصفحات القانونية", readOnlyHint: false, destructiveHint: false},
    description:
      "تحرير الصفحات القانونية الثلاث للمنصة — سياسة الخصوصية وشروط الاستخدام وأخلاقيات الحوار: قراءة نصوصها الحالية أو حفظ نص جديد يظهر على المنصة العامة فورًا.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "update"],
          description: "list جلب كل الصفحات (افتراضي) | update حفظ صفحة",
        },
        slug: {
          type: "string",
          enum: ["privacy", "terms", "dialogue-ethics"],
          description: "معرف الصفحة — إلزامي مع update",
        },
        title: { type: "string", description: "عنوان جديد اختياري للصفحة" },
        content: { type: "string", description: "النص الكامل الجديد — إلزامي مع update" },
      },
    },
  },
  {
    name: "manage_comment_features",
    title: "[القنوات الخاصة والحوكمة] صلاحيات التعليق المتقدمة",
    annotations: {title: "[القنوات الخاصة والحوكمة] صلاحيات التعليق المتقدمة", readOnlyHint: false, destructiveHint: true},
    description:
      "صلاحيات التعليق المتقدمة: تمييز تعليق «فكريًا ملهمًا» (معاملة ذرّية تثبّته أعلى حوار المقال وتبث لصاحبه +10 رصيد أثر مع إشعارات مزدوجة) أو إلغاء التمييز (-10 عكسية موثقة) — السبب إلزامي في الاتجاهين — أو تحرير نص التعليق بعلامة التحرير الإداري، أو حظر كاتب التعليق نهائيًا مع رفض كل تعليقاته المعلقة.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["inspire", "uninspire", "edit", "ban_author"],
          description:
            "inspire تمييز ملهم (+10) | uninspire إلغاء التمييز (-10) | edit تحرير النص | ban_author حظر الكاتب نهائيًا",
        },
        commentId: { type: "string", description: "معرف التعليق — إلزامي" },
        reason: {
          type: "string",
          description:
            "سبب التمييز أو إلغائه (5 أحرف فأكثر) — إلزامي مع inspire/uninspire ويُوثَّق في سجل أثر القارئ وإشعاره",
        },
        content: { type: "string", description: "النص الجديد — إلزامي مع edit" },
        banReason: { type: "string", description: "سبب الحظر مع ban_author (افتراضي: مخالفة أدب الحوار)" },
      },
      required: ["action", "commentId"],
    },
  },

  /* ==================== ح) البث والإشعارات وتحديثات المنصة ==================== */
  {
    name: "broadcast_notification",
    title: "[البث والإشعارات] مركز البث الجماهيري وسجل التحديثات",
    annotations: {title: "[البث والإشعارات] مركز البث الجماهيري وسجل التحديثات", readOnlyHint: false, destructiveHint: true},
    description:
      "مركز الإشعارات الجماهيري: بث إشعار لكل القراء غير المحظورين (أو إشعار مخصص لمستخدم بعينه) عبر جرس المنصة الداخلي وإشعار الويب الفوري لهواتفهم معًا، مع خيار توثيق البث في سجل تحديثات المنصة الظاهر للقراء — وجلب آخر التحديثات الموثقة أو تعديل سجل منها (عنوانه أو نصه أو نوعه) أو حذفه.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["send", "list_updates", "edit_update", "delete_update"],
          description: "send إرسال (افتراضي) | list_updates جلب سجل التحديثات | edit_update تعديل سجل قائم | delete_update حذف سجل",
        },
        title: { type: "string", description: "عنوان الإشعار — إلزامي مع send (3 أحرف فأكثر)" },
        details: { type: "string", description: "نص الإشعار/التحديث — إلزامي مع send" },
        url: { type: "string", description: "مسار يفتح عند النقر مثل /article/slug" },
        kind: {
          type: "string",
          enum: ["FEATURE", "MAINTENANCE", "INTELLECTUAL", "ALERT"],
          description: "نوع الإشعار: ميزة جديدة | صيانة | ترقية فكرية | تنبيه عام (افتراضي FEATURE)",
        },
        asPlatformUpdate: {
          type: "boolean",
          description: "توثيق الإشعار في سجل تحديثات المنصة الظاهر للقراء",
        },
        targetUserId: {
          type: "string",
          description: "معرف مستخدم لإشعار مخصص له وحده — اتركه فارغًا للبث للجميع",
        },
        sendInApp: { type: "boolean", description: "الإرسال لجرس المنصة الداخلي (افتراضي true)" },
        sendPush: { type: "boolean", description: "الإرسال كإشعار ويب فوري (افتراضي true)" },
        id: { type: "string", description: "معرف سجل التحديث — إلزامي مع edit_update وdelete_update" },
        limit: { type: "number", description: "عدد نتائج list_updates (افتراضي 12)" },
      },
    },
  },
  {
    name: "export_content_backup",
    title: "[النسخ الاحتياطي] لقطة المحتوى الكاملة",
    annotations: {title: "[النسخ الاحتياطي] لقطة المحتوى الكاملة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "نسخة احتياطية فورية كاملة للمحتوى في لقطة JSON واحدة منظمة: كل المقالات بحالاتها (بالمتن العادي والمشكول والتغذية الفكرية السرية authorIntent والأغلفة وبيانات الصوت وروابطه السحابية) والأقسام كلها والصفحات القانونية الثلاث والتكوين السيادي SiteConfig كله — خذها واحفظها في أي وقت؛ مقاطع الصوت الخام وكلماتها المتزامنة تُستبعد تخفيفًا للحجم وتكفي روابط الملفات للاسترجاع.",
    inputSchema: { type: "object", properties: {} },
  },

  /* ==================== ط) الإعدادات السيادية ==================== */
  {
    name: "manage_system_settings",
    title: "[الإعدادات السيادية] مفاتيح الحوكمة وقائمة الفحص",
    annotations: {title: "[الإعدادات السيادية] مفاتيح الحوكمة وقائمة الفحص", readOnlyHint: false, destructiveHint: false},
    description:
      "إعدادات المنصة السيادية: قراءة مفاتيح الحوكمة الحالية (AUTO_APPROVE_COMMENTS اعتماد التعليقات آليًا دون مراجعة، REQUIRE_CHECKLIST فرض قائمة الفحص الأخلاقي قبل النشر) وتغييرها، وقراءة بنود قائمة الفحص الأخلاقي أو استبدالها كلها.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "set", "get_checklist", "set_checklist"],
          description: "get قراءة الإعدادات (افتراضي) | set تغييرها | get_checklist بنود الفحص | set_checklist استبدالها",
        },
        autoApproveComments: {
          type: "boolean",
          description: "قيمة AUTO_APPROVE_COMMENTS الجديدة مع set",
        },
        requireChecklist: { type: "boolean", description: "قيمة REQUIRE_CHECKLIST الجديدة مع set" },
        items: {
          type: "array",
          items: { type: "string" },
          description: "بنود قائمة الفحص الجديدة (نصوص فقط) مع set_checklist — من 3 إلى 12 بندًا",
        },
      },
    },
  },
  {
    name: "manage_email_channel",
    title: "[الإعدادات السيادية] قناة البريد الرسمية",
    annotations: {title: "[الإعدادات السيادية] قناة البريد الرسمية", readOnlyHint: false, destructiveHint: false},
    description:
      "قناة البريد الرسمية — نفس منطق /api/email-channel: get قراءة حالة القناة (المفتاح مصدره البيئة أم قاعدة البيانات، المرسل الحالي)، set تحديث مفتاح RESEND_API_KEY و/أو عنوان المرسل SECURITY_EMAIL_FROM في SystemSetting مباشرةً بلا إعادة نشر (Zero-Deploy)، clear مسح المفتاح المحفوظ، test إرسال بريد تجريبي رسمي للمالك للتحقق أن القناة حية.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "set", "clear", "test"],
          description: "get الحالة (افتراضي) | set حفظ المفتاح و/أو المرسل | clear مسح المفتاح المحفوظ | test بريد تجريبي للمالك",
        },
        apiKey: {
          type: "string",
          description: "مع set: مفتاح Resend الصالح (يبدأ بـ re_) — يُحفظ في SystemSetting",
        },
        from: {
          type: "string",
          description: "مع set: عنوان المرسل مثل كلام له لازمة <no-reply@ziadamr.me> أو بريد مجرد يُغلَّف تلقائيًا",
        },
      },
    },
  },

  /* ==================== ي) الأمن والنبض الحي ==================== */
  {
    name: "manage_security",
    title: "[الأمن والرقابة] مركز أمن المنصة وقواعد IP",
    annotations: {title: "[الأمن والرقابة] مركز أمن المنصة وقواعد IP", readOnlyHint: false, destructiveHint: true},
    description:
      "مركز أمن المنصة: نظرة شاملة على آخر التنبيهات الأمنية ومحاولات الدخول الفاشلة وقواعد IP وسجل تدقيق اللوحة، مع حلّ التنبيهات، وإضافة قاعدة سماح ALLOW أو حجب DENY لأي عنوان IP أو إزالة قاعدة قائمة، وفحص رموز التحقق المؤقتة VerificationToken وسحبها كاملة.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["overview", "resolve_alert", "add_ip_rule", "remove_ip_rule", "list_auth_tokens", "purge_auth_tokens"],
          description: "overview نظرة شاملة (افتراضي) | resolve_alert حل تنبيه | add_ip_rule إضافة قاعدة | remove_ip_rule إزالتها | list_auth_tokens جرد رموز التحقق المؤقتة | purge_auth_tokens سحب كل الرموز منتهية الصلاحية أو كلها",
        },
        alertId: { type: "string", description: "معرف التنبيه — إلزامي مع resolve_alert" },
        ip: { type: "string", description: "عنوان IP — إلزامي مع add_ip_rule وremove_ip_rule" },
        mode: {
          type: "string",
          enum: ["ALLOW", "DENY"],
          description: "نوع القاعدة مع add_ip_rule (افتراضي DENY)",
        },
        note: { type: "string", description: "ملاحظة على القاعدة مع add_ip_rule" },
        ruleId: { type: "string", description: "بديل عن ip عند remove_ip_rule — معرف القاعدة" },
        expiredOnly: { type: "boolean", description: "مع purge_auth_tokens: true يسحب المنتهية فقط (افتراضي)، false يسحب كلها" },
      },
    },
  },
  {
    name: "get_live_activity",
    title: "[الأمن والرقابة] النبض الحي للأحداث",
    annotations: {title: "[الأمن والرقابة] النبض الحي للأحداث", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "النبض الحي للمنصة: آخر أحداث الشفافية المسجلة لحظيًا (دخول قارئ بنجاح أو حجب محاولة، تعليق مُرسل، تصويت، حفظ مقال، مشاركة اقتباس، رسالة تواصل) بفاعلها ومسارها وتفاصيلها — لمراقبة حركة المنصة لحظة بلحظة.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "فلتر بنوع الحدث مثل COMMENT_SUBMITTED أو VOTE أو AUTH_LOGIN_BLOCKED — احذفه لكل الأنواع",
        },
        hours: { type: "number", description: "المدة بالساعات الماضية (افتراضي 24)" },
        limit: { type: "number", description: "عدد الأحداث (افتراضي 30، أقصى 100)" },
      },
    },
  },

  /* ==================== ك) أتمتة التغطية الكاملة — كل ذرة في المنصة ==================== */
  {
    name: "delete_category",
    title: "[الأقسام] حذف قسم نهائيًا",
    annotations: {title: "[الأقسام] حذف قسم نهائيًا", readOnlyHint: false, destructiveHint: true},
    description:
      "حذف قسم نهائيًا من المنصة. مقالاته تبقى موجودة لكنها تنفصل عن الأقسام، أو مرر reassignToSlug لنقلها كلها إلى قسم آخر قبل الحذف. تُعاد ترندرة صفحات المنصة فورًا.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف القسم id — مرر id أو slug" },
        slug: { type: "string", description: "معرف القسم النصي slug — بديل عن id" },
        reassignToSlug: {
          type: "string",
          description: "نقل مقالات القسم إلى هذا القسم قبل حذفه (slug) — اختياري",
        },
      },
    },
  },
  {
    name: "manage_platform_errors",
    title: "[الأمن والرقابة] أخطاء المنصة المبلّغ عنها",
    annotations: {title: "[الأمن والرقابة] أخطاء المنصة المبلّغ عنها", readOnlyHint: false, destructiveHint: true},
    description:
      "عين العطل في المنصة: جلب أخطاء برمجية المتصفح المبلّغ عنها مجمعة بالبصمة (الرسالة، المكدس، المسار، العدد، آخر ظهور)، وحذف سجل خطأ بعينه أو مسح السجل كله بعد معالجته.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "delete", "clear_all"],
          description: "list جلب (افتراضي) | delete حذف سجل | clear_all مسح السجل كله",
        },
        digest: { type: "string", description: "بصمة الخطأ — إلزامي مع delete" },
        path: { type: "string", description: "فلتر قائمة الجلب بمسار الصفحة" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 30، أقصى 100)" },
      },
    },
  },
  {
    name: "list_impact_ledger",
    title: "[التحليلات والرقابة] دفتر أثر القراء الموثق",
    annotations: {title: "[التحليلات والرقابة] دفتر أثر القراء الموثق", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "دفتر أثر القراء الموثق نقطة بنقطة: كل منح وخصم وقراءة مكتملة وتعليق معتمد وتمييز ملهم ومشاركة اقتباس، بفاعله وسببه ومقاله ومفتاح منع التكرار — فلترة بمستخدم أو نوع فعل.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "فلترة بمستخدم بعينه" },
        actionType: {
          type: "string",
          description:
            "فلترة بنوع الفعل: READ_COMPLETE | AI_DISCUSS | COMMENT_APPROVED | COMMENT_INSPIRING | QUOTE_SHARE | ADMIN_ADJUST",
        },
        limit: { type: "number", description: "عدد النتائج (افتراضي 40، أقصى 100)" },
        offset: { type: "number", description: "إزاحة الترقيم للصفحات" },
      },
    },
  },
  {
    name: "manage_search_history",
    title: "[التفاعل الخام] ذاكرة بحث القراء",
    annotations: {title: "[التفاعل الخام] ذاكرة بحث القراء", readOnlyHint: false, destructiveHint: true},
    description:
      "ذاكرة بحث القراء (SearchHistory — يكتبه الموقع العام على قاعدة Neon نفسها): top لعرض أكثر الكلمات بحثًا عبر المنصة (عدد البحثات وعدد الباحثين المميزين — مدخل ذكي لاختيار مواضيع المقالات)، user لسجل بحث قارئ بعينه، clear لمسح سجل قارئ أو استعلام محدد، وclear_all لمسح السجل كله (بإقرار confirm='أؤقر التنفيذ').",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["top", "user", "clear", "clear_all"],
          description: "top الأكثر بحثًا (افتراضي) | user سجل قارئ | clear مسح سجل قارئ | clear_all مسح السجل كله",
        },
        limit: { type: "number", description: "عدد النتائج (افتراضي 20، أقصى 100)" },
        userId: { type: "string", description: "معرف القارئ مع user وclear — أو email بدلًا منه" },
        email: { type: "string", description: "بريد القارئ — بديل عن userId" },
        query: { type: "string", description: "مع clear: مسح استعلام بعينه من سجل القارئ بدل مسح سجله كله" },
        confirm: { type: "string", description: "الإقرار النصي 'أؤقر التنفيذ' — إلزامي مع clear_all" },
      },
    },
  },
  {
    name: "manage_social_graph",
    title: "[التفاعل الخام] تصويتات ومشاركات ومحفوظات",
    annotations: {title: "[التفاعل الخام] تصويتات ومشاركات ومحفوظات", readOnlyHint: false, destructiveHint: true},
    description:
      "ذرات التفاعل الاجتماعي الخام: إعجابات/عدم إعجابات (التصويتات) ومشاركات الاقتباس على منصاتها ومكتبة المحفوظات لكل قارئ — جلبها لمقال أو مستخدم، وإزالة أي سجل بعينه (تصويت مزعج، مشاركة وهمية، محفوظة).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "remove"],
          description: "list جلب (افتراضي) | remove إزالة سجل بعينه",
        },
        kind: {
          type: "string",
          enum: ["votes", "shares", "saved"],
          description: "votes التصويتات | shares المشاركات | saved المحفوظات — إلزامي مع remove",
        },
        recordId: { type: "string", description: "معرف السجل — إلزامي مع remove" },
        articleId: { type: "string", description: "فلترة بمقال" },
        userId: { type: "string", description: "فلترة بمستخدم (أو visitorFp للضيوف في التصويتات)" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 40، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_reading_data",
    title: "[التفاعل الخام] بيانات القراءة الخام وحق النسيان",
    annotations: {title: "[التفاعل الخام] بيانات القراءة الخام وحق النسيان", readOnlyHint: false, destructiveHint: true},
    description:
      "بيانات القراءة الخام سجلًا سجلًا: كل زيارة بمسارها وجهازها ومصدرها ومدة قراءتها واكتمالها — مع إمكانية حذف أي سجل، أو محو كل آثار زائر عبر بصمته (حق النسيان)، أو تفريغ بيانات مقال.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "delete"],
          description: "list جلب (افتراضي) | delete حذف",
        },
        id: { type: "string", description: "معرف السجل — إلزامي مع delete إذا لم تمرر visitorFp أو articleId" },
        visitorFp: {
          type: "string",
          description: "بصمة زائر — مع delete تمحو كل آثاره (حق النسيان)، ومع list تفلتر سجلاته",
        },
        articleId: { type: "string", description: "فلترة بمقال — ومع delete تمحو كل سجلاته" },
        path: { type: "string", description: "فلترة بمسار الصفحة" },
        completedOnly: { type: "boolean", description: "القراءات المكتملة فقط" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 40، أقصى 100)" },
        offset: { type: "number", description: "إزاحة الترقيم" },
      },
    },
  },
  {
    name: "manage_notifications_inbox",
    title: "[البث والإشعارات] جرس إشعارات القراء",
    annotations: {title: "[البث والإشعارات] جرس إشعارات القراء", readOnlyHint: false, destructiveHint: true},
    description:
      "جرس إشعارات القراء الداخلي من حيث لا يتوقع: جلب إشعارات كل المستخدمين أو مستخدم بعينه (غير المقروء أولًا)، وتعليم أي إشعار مقروءًا أو إرجاعه، أو حذفه من الجرس نهائيًا.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "mark_read", "mark_unread", "delete"],
          description: "list جلب (افتراضي) | بقية الأفعال تتطلب id الإشعار",
        },
        id: { type: "string", description: "معرف الإشعار — إلزامي مع mark_read وmark_unread وdelete" },
        userId: { type: "string", description: "فلترة قائمة الجلب بمستخدم" },
        unreadOnly: { type: "boolean", description: "غير المقروءة فقط" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 40، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_admin_notifications",
    title: "[البث والإشعارات] مركز نشاط الأدمن",
    annotations: {title: "[البث والإشعارات] مركز نشاط الأدمن", readOnlyHint: false, destructiveHint: true},
    description:
      "مركز نشاط الأدمن نفسه — إشعارات وتنبيهات الطوارئ الواردة لحساب صاحب المنصة (أنواع ADMIN_* في جدول Notification الموحد): list آخر الإشعارات بعداد غير المقروء، unread_count العداد وأهم إشعار عاجل، mark_read تعليم إشعار مقروءًا، mark_all_read تصفير الجرس، dismiss إخفاء إشعار من المركز، delete حذفه نهائيًا، clear_old تقليم المقروء القديم (بالأيام).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "unread_count", "mark_read", "mark_all_read", "dismiss", "delete", "clear_old"],
          description: "list جلب (افتراضي) | unread_count العداد والعاجل | mark_read مقروء | mark_all_read تصفير الجرس | dismiss إخفاء | delete حذف | clear_old تقليم القديم",
        },
        id: { type: "string", description: "معرف الإشعار — إلزامي مع mark_read وdismiss وdelete" },
        adminOnly: {
          type: "boolean",
          description: "قصر القائمة والتصفير على أنواع الأدمن ADMIN_* — افتراضي true (false = كل الإشعارات الشخصية للمالك)",
        },
        unreadOnly: { type: "boolean", description: "غير المقروءة فقط مع list" },
        days: { type: "number", description: "مع clear_old: تقليم المقروء الأقدم من كم يوم (افتراضي 30، مدى 1-365)" },
        limit: { type: "number", description: "عدد النتائج مع list (افتراضي 50، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_push_subscriptions",
    title: "[البث والإشعارات] سجل اشتراكات الإشعارات الفورية",
    annotations: {title: "[البث والإشعارات] سجل اشتراكات الإشعارات الفورية", readOnlyHint: false, destructiveHint: true},
    description:
      "سجل أجهزة الإشعارات الفورية: اشتراكات القراء المشتركة بهواتفها واشتراكات الأدمن، بنقاط نهايتها وأجهزتها وآخر ظهور — مع إزالة أي اشتراك منتهٍ أو مزعج.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "remove"],
          description: "list جلب (افتراضي) | remove إزالة اشتراك",
        },
        kind: {
          type: "string",
          enum: ["user", "admin"],
          description: "user اشتراكات القراء | admin اشتراكات الأدمن — افتراضي user",
        },
        id: { type: "string", description: "معرف الاشتراك — إلزامي مع remove" },
        userId: { type: "string", description: "فلترة قائمة القراء بمستخدم" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 50، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_admin_account",
    title: "[حساب الإدارة] ذرات حسابات الإدارة والمشرفين",
    annotations: {title: "[حساب الإدارة] ذرات حسابات الإدارة والمشرفين", readOnlyHint: false, destructiveHint: true},
    description:
      "ذرات حسابات الإدارة كاملة: نظرة شاملة على حسابات الأدمن والجلسات الحية والأجهزة الموثوقة وحالة التحقق الثنائي، مع إبطال أي جلسة، وإزالة جهاز موثوق، وتغيير كلمة المرور (بالتحقق الحالي)، وطوارئ تعطيل التحقق الثنائي عند فقدان الهاتف (بكلمة المرور الحالية وتنبيه أمني CRITICAL)، وإدارة فريق المشرفين كله: إنشاء حساب مشرف جديد في جدول AdminUser بكلمة مرور قوية، أو حذف حساب مشرف (حماية صارمة لأقدم حساب المالك وآخر حساب في المنصة)، أو تصفير التحقق الثنائي لأي حساب مشرف آخر عند الطوارئ.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "overview",
            "revoke_session",
            "remove_device",
            "change_password",
            "disable_2fa",
            "create_admin",
            "delete_admin",
            "reset_admin_2fa",
          ],
          description:
            "overview نظرة شاملة (افتراضي) | revoke_session إبطال جلسة | remove_device إزالة جهاز موثوق | change_password تغيير كلمة المرور | disable_2fa طوارئ تعطيل التحقق الثنائي لحساب المالك | create_admin إنشاء حساب مشرف جديد | delete_admin حذف حساب مشرف | reset_admin_2fa تصفير التحقق الثنائي لحساب مشرف آخر",
        },
        sessionId: { type: "string", description: "معرف الجلسة — إلزامي مع revoke_session" },
        deviceId: { type: "string", description: "معرف الجهاز — إلزامي مع remove_device" },
        currentPassword: {
          type: "string",
          description: "كلمة المرور الحالية — إلزامية مع change_password وdisable_2fa للتحقق",
        },
        newPassword: { type: "string", description: "كلمة المرور الجديدة — إلزامية مع change_password وcreate_admin" },
        username: {
          type: "string",
          description: "اسم حساب المشرف — إلزامي مع create_admin وdelete_admin وreset_admin_2fa",
        },
      },
    },
  },
  {
    name: "manage_discussion_quota",
    title: "[التفاعل الخام] حصص نقاش الذكاء الاصطناعي",
    annotations: {title: "[التفاعل الخام] حصص نقاش الذكاء الاصطناعي", readOnlyHint: false, destructiveHint: true},
    description:
      "حصص نقاش الذكاء الاصطناعي سجلًا سجلًا: من ناقش أي مقال وكم رسالة أرسل ومتى — مع تصفير حصة قارئ في مقال بعينه (حذف السجل يفتح له نقاشًا جديدًا).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "reset"],
          description: "list جلب (افتراضي) | reset تصفير حصة",
        },
        id: { type: "string", description: "معرف السجل — بديل عن userId+articleId مع reset" },
        userId: { type: "string", description: "فلترة/تصفير بمستخدم" },
        articleId: { type: "string", description: "فلترة/تصفير بمقال" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 40، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_media",
    title: "[الخزنة السحابية] استهلاك وجرد وحذف أصول الميديا",
    annotations: {title: "[الخزنة السحابية] استهلاك وجرد وحذف أصول الميديا", readOnlyHint: false, destructiveHint: true},
    description:
      "خزنة الميديا السحابية Cloudinary خارج قاعدة البيانات — كل أغلفة المقالات والصوتيات وأفاتارات القراء: استهلاك الحساب الكامل (المساحة والباندويث والخطة وعدد الأصول)، وجرد الأصول بمجلد أو بادئة (صور image أو صوت video)، وحذف أي أصل يتيم أو مكرر بمعرفه public_id. هكذا تكتمل السيادة على المنظومة كلها حتى خارج جداول قاعدة البيانات.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["stats", "list", "delete"],
          description: "stats استهلاك الحساب (افتراضي) | list جرد الأصول | delete حذف أصل",
        },
        prefix: { type: "string", description: "مع list: بادئة المجلد (افتراضي kalam — جرّب kalam/audio للصوتيات)" },
        resourceType: {
          type: "string",
          enum: ["image", "video", "raw"],
          description: "نوع الأصل مع list وdelete — image صور (افتراضي) | video صوتيات | raw ملفات",
        },
        limit: { type: "number", description: "مع list: عدد الأصول (افتراضي 30، أقصى 100)" },
        cursor: { type: "string", description: "مع list: رمز الترقيم للدفعة التالية next_cursor" },
        publicId: { type: "string", description: "مع delete: معرف الأصل — إلزامي" },
      },
    },
  },
  {
    name: "view_as_reader",
    title: "[التحليلات والرقابة] عين القارئ — الشاشة من ناحيته",
    annotations: {title: "[التحليلات والرقابة] عين القارئ — الشاشة من ناحيته", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "عين القارئ — الشاشة نفسها التي يراها القارئ من ناحيته لا من ناحية الإدارة: هويته المعروضة (الاسم المختار والصورة والنبذة) ورتبته الفكرية ورصيد أثره ومسافته للرتبة التالية وأهليته لعضوية «أهل الكلمة»، مكتبته المحفوظة، تصويتاته على المقالات، تعليقاته مفصولة ما يظهر منه للعامة وما يخفى عنها (معلق/مرفوض/مبلَّغ عنه)، جرس إشعاراته وعدد غير المقروء، مقترحاته وحالتها، حصص نقاش الذكاء الاصطناعي لكل مقال بالمتبقي كما يحسبه الموقع تمامًا من رتبته، أجهزة إشعاراته الفورية، مزودات دخوله وجلساته، وآخر دفتر أثره (قراءات مكتملة ومشاركات ومنح وخصوم). وبتعليم visitor ترى ما يراه الزائر الغريب غير المسجل: حالات الحوكمة المؤثرة عليه والأقسام والمقالات المنشورة والصفحات القانونية. وبتعليم article مع articleId أو slug ترى صفحة مقال بعينه بعيون الجمهور (حالته وظهوره الفعلي وتصويتاته وتعليقاته المعتمدة والمعلقة وصوتياته ومقالات قسمه المجاورة) وما يخصّ قارئًا معينًا فيها إن مررت userId أو email: تصويته هو، وهل في مكتبته، وحصته المتبقية من نقاش الذكاء الاصطناعي على هذا المقال تحديدًا، وتعليقاته عليه ظاهرةً ومخفية.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["profile", "visitor", "article"],
          description: "profile شاشة قارئ بعينه (افتراضي) | visitor ما يراه الزائر غير المسجل | article صفحة مقال بعين الجمهور + بؤبؤ القارئ عليها",
        },
        userId: { type: "string", description: "معرف القارئ — أو مرر email بدلًا منه (إلزامي مع profile، اختياري مع article لإضافة زاوية القارئ)" },
        email: { type: "string", description: "بريد القارئ — بديل عن userId" },
        articleId: { type: "string", description: "معرف المقال مع فعل article — أو مرر slug بدلًا منه" },
        slug: { type: "string", description: "معرف المقال في الرابط مع فعل article — بديل عن articleId" },
        limit: { type: "number", description: "عدد عناصر كل قسم من الشاشة (افتراضي 15، أقصى 50)" },
      },
    },
  },
  /* ==================== ح) الفحص الذاتي والتشغيل اليدوي ==================== */
  {
    name: "get_site_health",
    title: "[التشغيل والصيانة] الفحص الذاتي الشامل",
    annotations: {title: "[التشغيل والصيانة] الفحص الذاتي الشامل", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "الفحص الذاتي الشامل للمنصة في استدعاء واحد — كشف الاستدلالات المقلقة قبل أن تتحول إلى مشاكل: مقالات مجدولة حان وقتها ولم تُنشر بعد (تأخر مهمة الكرون)، مقاطع صوتية عالقة في المعالجة أو فشلت، مسودات مهجورة، تعليقات معلقة قديمة أو مبلَّغ عنها، رسائل تواصل ومقترحات غير معالجة، تنبيهات أمنية غير محسومة ودرجاتها، محاولات دخول فاشلة آخر 24 ساعة وقواعد IP النشطة، تقارير أعطال المستخدمين وعدد تكرارها وآخرها، قارئون محظورون، اشتراكات إشعارات ميتة، وزمن استجابة قاعدة البيانات مقاسًا فعليًا. تُعاد مع حكم نهائي: سليمة أم تحتاج نظر، وقائمة رموز للمشاكل.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "run_maintenance",
    title: "[التشغيل والصيانة] نشر المجدول وتقليم السجلات",
    annotations: {title: "[التشغيل والصيانة] نشر المجدول وتقليم السجلات", readOnlyHint: false, destructiveHint: true},
    description:
      "تشغيل مهام التشغيل يدويًا فورًا دون انتظار الكرون: فعل publish_scheduled ينفذ نفس منطق مهمة Vercel المجدولة (3:30 فجرًا) الآن — يقلب كل مقال مجدول حان وقته إلى منشور فعليًا ويضبط وقت النشر ويعيد تنشيط الكاش ويعد بقائمة بما نُشر؛ وفعل prune_logs يقلم سجلات المراقبة القديمة (RequestLog وServerErrorLog) حفاظًا على مساحة قاعدة Neon — استدعِ publish_scheduled إذا رصد الفحص الذاتي مقالات متأخرة أو أراد الزعيم نشرًا لحظيًا، وprune_logs دوريًا كل أسبوعين",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["publish_scheduled", "prune_logs"],
          description: "publish_scheduled نشر كل المجدول المستحق الآن | prune_logs تقليم سجلات المراقبة القديمة",
        },
        keepDays: {
          type: "number",
          description: "مع prune_logs: الاحتفاظ بآخر كم يوم من السجلات (افتراضي 14، مدى 3-90)",
        },
      },
    },
  },
  {
    name: "manage_comment_votes",
    title: "[التفاعل الخام] تصويتات التعليقات",
    annotations: {title: "[التفاعل الخام] تصويتات التعليقات", readOnlyHint: false, destructiveHint: true},
    description:
      "سيادة كاملة على تصويتات التعليقات (إعجاب/عدم إعجاب القارئين على تعليقات بعضهم): list لجرد أصوات تعليق بعينه أو قارئ بعينه مع هوية المصوّت وموضع التعليق وملخص العدادات، stats لملخص عدادات تعليق أو أحدث التصويتات عبر المنصة، delete لإزالة صوت بعينه بمعرفه، وclear لمسح كل أصوات تعليق عند التنظيف الإشرافي (مع توثيق كامل في دفتر التدقيق).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "stats", "delete", "clear"],
          description: "list جرد | stats عدادات | delete صوت بعينه | clear مسح أصوات تعليق",
        },
        commentId: { type: "string", description: "معرف التعليق — إلزامي مع clear، واختياري (أو userId) مع list وstats" },
        userId: { type: "string", description: "معرف القارئ — بديل أو مكمّل لـ commentId في list وstats" },
        voteId: { type: "string", description: "معرف الصوت مع delete — إلزامي" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 30، أقصى 100)" },
      },
    },
  },
  {
    name: "manage_login_logs",
    title: "[الأمن والرقابة] سجل أمن الدخول",
    annotations: {title: "[الأمن والرقابة] سجل أمن الدخول", readOnlyHint: false, destructiveHint: true},
    description:
      "سيادة كاملة على سجل أمن الدخول (LoginLog — محرك إشعارات الأمان السيادي): list لجرد آخر دخولات القارئين مع نوع الجهاز والمتصفح ونظام التشغيل والموقع التقريبي وعلامة الجهاز الجديد وقنوات التنبيه، stats لملخص أمني شامل (إجمالي الدخولات، أجهزة جديدة، تنبيهات مُرسلة وقنواتها، نبض 24 ساعة)، delete لحذف سجل بعينه بمعرفه، وclear لمسح السجل كليًا عند التنظيف (مع توثيق كامل في دفتر التدقيق).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "stats", "delete", "clear"],
          description: "list جرد | stats ملخص أمني | delete حذف سجل | clear مسح كامل",
        },
        userId: { type: "string", description: "تصفية على قارئ بعينه مع list" },
        newDeviceOnly: { type: "boolean", description: "مع list: قصر الجرد على الدخولات من أجهزة جديدة" },
        logId: { type: "string", description: "معرف السجل مع delete — إلزامي" },
        limit: { type: "number", description: "عدد النتائج (افتراضي 30، أقصى 100)" },
      },
    },
  },
{
  "name": "get_system_telemetry",
  "title": "[التشغيل والصيانة] مرصد النظام الحي",
  "annotations": {"title": "[التشغيل والصيانة] مرصد النظام الحي", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "نبض النظام الحي الشامل: صحة قاعدة Neon PostgreSQL (زمن الاستجابة، الاتصالات النشطة مقابل السقف الأقصى، حجم القاعدة، إصدار المحرك)، لقطة حركة آخر 60 دقيقة (إجمالي الطلبات والأخطاء والمعدل الدقيق وأكثر المسارات مرورًا وتوزيع الأجهزة والدول)، نبض أخطاء التشغيل الأخيرة، مع طابع لحظة القياس.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
},
{
  "name": "get_traffic_log",
  "title": "[التشغيل والصيانة] سجل حركة الخادم",
  "annotations": {"title": "[التشغيل والصيانة] سجل حركة الخادم", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "سجل حركة الخادم الحي: كل استدعاءات Route Handlers وServer Actions بمنصة عامة ولوحة تحكم معًا — المسار والطريقة وكود الاستجابة ونوع الجهاز (هاتف/حاسوب/لوحي/روبوت) وIP والدولة والمدة، مع تصفية بالنافذة الزمنية أو معرف/بريد القارئ أو الأخطاء فقط.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "seconds": {
        "type": "number",
        "description": "نافذة الزمن بالثواني (افتراضي 600 — أقصى 86400)"
      },
      "userId": {
        "type": "string",
        "description": "تصفية بمعرف القارئ أو بريده الإلكتروني"
      },
      "errorOnly": {
        "type": "boolean",
        "description": "قصر النتائج على الطلبات التي اصطدمت بخطأ 500"
      },
      "path": {
        "type": "string",
        "description": "بحث جزئي في مسار الطلب"
      },
      "limit": {
        "type": "number",
        "description": "عدد السجلات (افتراضي 60 — أقصى 200)"
      }
    }
  }
},
{
  "name": "get_server_errors",
  "title": "[التشغيل والصيانة] سجل أخطاء التشغيل اللحظية",
  "annotations": {"title": "[التشغيل والصيانة] سجل أخطاء التشغيل اللحظية", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "سجل أخطاء التشغيل اللحظية (instrumentation): الرسالة والـ Stack Trace الكامل وطريق الحدث ونوعه (route-handler/server-action/render) وعدد التكرارات وبصمة التجميع — فور وقوعها.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "عدد الأخطاء (افتراضي 25 — أقصى 100)"
      }
    }
  }
},
{
  "name": "get_api_quotas",
  "title": "[التشغيل والصيانة] حصص الواجهات الخارجية",
  "annotations": {"title": "[التشغيل والصيانة] حصص الواجهات الخارجية", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "حصص واستهلاك الواجهات الخارجية اليومي وآخر 7 أيام: محاورة Gemini النصية، توليد الصوت Gemini TTS، تسليم بريد Resend (مع حالة النطاقات من API رسمي عند توفر المفتاح)، وتخزين الوسائط Cloudinary (الخطة ورصيد الاستخدام والتخزين والباندودث وعدد الأصول).",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
},
{
  "name": "get_site_config",
  "title": "[الإعدادات السيادية] قراءة التكوين السيادي",
  "annotations": {"title": "[الإعدادات السيادية] قراءة التكوين السيادي", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "قراءة التكوين السيادي للمنصة من جدول SiteConfig: الهوية والعلامة (الاسم والوثائق والتذييل وروابط التواصل)، النصوص (الترحيب وشرائح التهيئة وشارة المحاور وتنويهه)، مفاتيح الميزات (المحاورة الذكية والتعليقات والمشغل الصوتي وقناة أهل الكلمة)، ومعايير اقتصاد الأثر (الأوزان والعتبة) — كله أو تصنيفًا أو مفتاحًا.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": [
          "BRANDING",
          "SOCIAL",
          "TEXTS",
          "FLAGS",
          "IMPACT"
        ],
        "description": "تصفية بتصنيف واحد (SOCIAL لروابط التواصل الرسمية) — تُترك فارغة للكل"
      },
      "key": {
        "type": "string",
        "description": "قراءة مفتاح بعينه بقيمته وتعريفه"
      }
    }
  }
},
{
  "name": "set_site_config",
  "title": "[الإعدادات السيادية] تعديل التكوين السيادي لحظيًا",
  "annotations": {"title": "[الإعدادات السيادية] تعديل التكوين السيادي لحظيًا", readOnlyHint: false, destructiveHint: false},
  "description": "تعديل التكوين السيادي وتطبيقه لحظيًا على الإنتاج دون إعادة نشر (Zero-Deploy): يتحقق من نوع كل مفتاح، يكتب في جدول SiteConfig، يفرغ كاش التكوين عبر revalidateTag، ويعيد تحقق المنصة العامة عابرة للتطبيقات — كل ذلك موثق في سجل التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entries": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "key": {
              "type": "string"
            },
            "value": {}
          },
          "required": [
            "key",
            "value"
          ]
        },
        "description": "مصفوفة المفاتيح المعدلة [{ key, value }] — مثال: [{\"key\":\"AI_DISCUSS_ENABLED\",\"value\":false}]"
      }
    },
    "required": [
      "entries"
    ]
  }
},
{
  "name": "admin_cli",
  "title": "[التشغيل والصيانة] تيرمينال الأوامر السيادي",
  "annotations": {"title": "[التشغيل والصيانة] تيرمينال الأوامر السيادي", readOnlyHint: false, destructiveHint: true},
  "description": "تنفيذ أوامر التيرمينال السيادي Interactive CLI: sys info (نبض النظام والبيئة)، cache purge [all|path] (إفراغ الكاش فورًا)، user inspect <email|id> (السجل الأمني الكامل ونقاط الأثر والجلسات)، user ban/unban <email> [سبب] (تعطيل/تفعيل الحساب)، config list|get|set (سيادة التكوين)، db stats (الجداول والسجلات والأحجام)، traffic tail [n] وerrors tail [n] (آخر الحركة والأخطاء)، security tail [n] (اللوحة الأمنية: التنبيهات ومحاولات الاختراق واصطياد البوتات)، help (القائمة) — كل فعل مُغيِّر يوثق في دفتر التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "نص الأمر الكامل — مثل: user inspect user@mail.com أو config set IMPACT_ELDERS_THRESHOLD 400 أو security tail"
      }
    },
    "required": [
      "command"
    ]
  }
},
{
  "name": "send_test_push",
  "title": "[البث والإشعارات] بث إشعار تجريبي لأجهزة الإدارة",
  "annotations": {"title": "[البث والإشعارات] بث إشعار تجريبي لأجهزة الإدارة", readOnlyHint: false, destructiveHint: false},
  "description": "بث إشعار ويب Push فوري تجريبي إلى كل أجهزة الإدارة المسجلة (AdminPushSubscription) للتحقق من أن قناة التنبيهات حية — تُستخدم بعد النشر أو قبل الفعاليات للتأكد من وصول التنبيهات لهواتف الإدارة. يوثق في سجل التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "عنوان الإشعار (اختياري — افتراضي: اختبار قناة التنبيهات)"
      },
      "body": {
        "type": "string",
        "description": "نص الإشعار (اختياري)"
      }
    }
  }
},
{
  "name": "get_security_overview",
  "title": "[الأمن والرقابة] اللوحة الأمنية المجمعة",
  "annotations": {"title": "[الأمن والرقابة] اللوحة الأمنية المجمعة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "اللوحة الأمنية المجمعة لآخر 24 ساعة: عدّاد محاولات الدخول الفاشلة (LoginAttempt) وحظور التسجيل العنيف BRUTE_FORCE وبوتات فخ Honeypot المصطادة وتجاوزات حدود المعدل RATE_LIMIT، آخر التنبيهات الأمنية SecurityAlert بدرجات خطورتها (INFO/WARN/CRITICAL)، وأحدث بصمات أخطاء 500 من ServerErrorLog — صورة الحصانة الكاملة في استدعاء واحد.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "alertsLimit": {
        "type": "number",
        "description": "عدد التنبيهات الأخيرة المراد جلبها (افتراضي 15، أقصى 50)"
      },
      "errorsLimit": {
        "type": "number",
        "description": "عدد أخطاء الخادم الأخيرة المراد جلبها (افتراضي 10، أقصى 30)"
      }
    }
  }
},
{
  "name": "kalam_manage_vip_privileges",
  "title": "[العضوية والتوثيق] إدارة العضوية المميزة",
  "annotations": {"title": "[العضوية والتوثيق] إدارة العضوية المميزة", readOnlyHint: false, destructiveHint: false},
  "description": "إدارة العضوية المميزة المستقلة (VIP Privileges) لأي قارئ — منفصلة تمامًا عن التوثيق الرسمي: grant لتفعيل العضوية بكبسولة مسماة بلون سداسي وسبب إلزامي وحزم صلاحيات دقيقة (حصة ذكاء غير محدودة، تجاوز حدود المعدل والتهدئة، قناة أهل الكلمة، تثبيت ذاتي للتعليقات، إطار تعليق فخم، ميزات تجريبية) ورصيد أثر ترحيبي ورتبة وظيفية اختيارية، set_privileges لتحديث مفاتيح الصلاحيات وحدها لحظيًا، revoke لسحب العضوية والشارة بسبب إلزامي (التوثيق الرسمي لا يُمس) — كل فعل يُشعِر المستخدم فورًا ويُوثق في سجلي التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["check", "grant", "set_privileges", "revoke"], "description": "check فحص | grant منح/تحديث العضوية | set_privileges تحديث الصلاحيات فقط | revoke سحب — إلزامي" },
      "email": { "type": "string", "description": "بريد القارئ المستهدف — إلزامي" },
      "badgeTitle": { "type": "string", "description": "مسمى الكبسولة الظاهر بجانب اسمه مثل «مساهم متميز» — إلزامي مع grant (2-40 حرفًا)" },
      "badgeColor": { "type": "string", "description": "لون الكبسولة السداسي مثل #D97706 (افتراضي #7C3AED)" },
      "reason": { "type": "string", "description": "سبب الإجراء — إلزامي مع grant وset_privileges وrevoke، يُحفظ في السجل ويظهر في إشعار المستخدم" },
      "role": { "type": "string", "enum": ["USER", "MODERATOR", "EDITOR", "ADMIN"], "description": "الرتبة الوظيفية مع grant (اختياري — الافتراضي بلا تغيير)" },
      "welcomePoints": { "type": "number", "description": "رصيد أثر ترحيبي فوري 0-10000 مع grant (اختياري)" },
      "resetRole": { "type": "boolean", "description": "مع revoke: إعادة الرتبة إلى USER (اختياري — الافتراضي false، الرتبة تبقى)" },
      "privileges": {
        "type": "object",
        "description": "مفاتيح الصلاحيات الممنوحة (مع grant تعريف كامل، ومع set_privileges دمج جزئي — كل مفتاح true يُفعّل)",
        "properties": {
          "unlimitedAiChat": { "type": "boolean", "description": "حصة ذكاء اصطناعي غير محدودة" },
          "bypassRateLimits": { "type": "boolean", "description": "تجاوز محددات المعدل" },
          "bypassCooldowns": { "type": "boolean", "description": "تجاوز فترات التهدئة" },
          "ahlAlKalimaAccess": { "type": "boolean", "description": "قناة أهل الكلمة فورية" },
          "selfPinComment": { "type": "boolean", "description": "تثبيت تعليقاته ذاتيًا" },
          "vipCommentBorder": { "type": "boolean", "description": "إطار تعليق فخم بلون الشارة" },
          "betaFeatures": { "type": "boolean", "description": "وصول مبكر للميزات التجريبية" }
        }
      }
    },
    "required": ["action", "email"]
  }
},
{
  "name": "kalam_manage_verification",
  "title": "[العضوية والتوثيق] إدارة التوثيق الرسمي",
  "annotations": {"title": "[العضوية والتوثيق] إدارة التوثيق الرسمي", readOnlyHint: false, destructiveHint: false},
  "description": "إدارة التوثيق الرسمي — إثبات الهوية فقط (Proof of Identity)، منفصل تمامًا عن العضوية المميزة: check لفحص حالة التوثيق وتصنيفه ومسماه، grant لمنح علامة الصح الرسمية بنوع محدد (OWNER مؤسس حصري بالبذر التلقائي، OFFICIAL_AUTHOR كاتب رسمي زيتي، FAMILY_CORE فرد عائلة موثق فيروزي، NOTABLE نخبة أهل الكلمة كحلي)، update لتعديل النوع أو المسمى الظاهر لحظيًا، revoke لسحب التوثيق فقط بسبب إلزامي (العضوية المميزة لا تُمس). مزايا التوثيق البنيوية تلقائية: أولوية النقاشات، تخطي التهدئة، البطاقة الفكرية الموسعة — كل فعل يُشعِر المستخدم ويُوثق في دفتر التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["check", "grant", "update", "revoke"], "description": "check فحص | grant منح | update تعديل النوع/المسمى | revoke سحب — إلزامي" },
      "email": { "type": "string", "description": "بريد الحساب المستهدف — إلزامي" },
      "verificationType": { "type": "string", "enum": ["OWNER", "OFFICIAL_AUTHOR", "FAMILY_CORE", "NOTABLE"], "description": "نوع التوثيق مع grant/update (الافتراضي OFFICIAL_AUTHOR، وOWNER مرفوض يدويًا)" },
      "verificationLabel": { "type": "string", "description": "مسمى عرض اختياري بجانب الختم يفوق تسمية التصنيف (2-40 حرفًا)" },
      "reason": { "type": "string", "description": "السبب الإداري — اختياري مع grant/update، إلزامي مع revoke؛ يظهر في إشعار المستخدم" }
    },
    "required": ["action", "email"]
  }
},
{
  "name": "kalam_dispatch_vip_notification",
  "title": "[البث والإشعارات] إشعار توثيق وتمييز فوري",
  "annotations": {"title": "[البث والإشعارات] إشعار توثيق وتمييز فوري", readOnlyHint: false, destructiveHint: false},
  "description": "إطلاق إشعار توثيق وتمييز فوري لأي مستخدم عبر القنوات الثلاث معًا: إشعار داخلي في جرس المنصة، بث ويب فوري لهاتفه، وبريد إلكتروني مصمم عبر Resend — بأحداث جاهزة (منح شارة، بلوغ أهل الكلمة، تعديل مزايا، سحب شارة، منح توثيق رسمي، سحب توثيق) أو نص مخصص، مع تسجيل قنوات التسليم في سجل الأحداث الحي لمركز نشاط الأدمن.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "email": { "type": "string", "description": "بريد المستخدم المستهدف — إلزامي" },
      "event": { "type": "string", "enum": ["GRANTED", "ELITE", "MODIFIED", "REVOKED", "VERIFIED", "UNVERIFIED", "CUSTOM"], "description": "نوع الحدث — GRANTED منح شارة | ELITE أهل الكلمة | MODIFIED تعديل مزايا | REVOKED سحب شارة | VERIFIED منح توثيق رسمي | UNVERIFIED سحب توثيق | CUSTOM نص مخصص" },
      "badgeTitle": { "type": "string", "description": "مسمى الشارة في نص الإشعار" },
      "badgeColor": { "type": "string", "description": "لون الشارة في قالب البريد" },
      "reason": { "type": "string", "description": "سبب الإدارة المُظهر في الإشعار" },
      "customTitle": { "type": "string", "description": "عنوان مخصص مع event=CUSTOM" },
      "customBody": { "type": "string", "description": "نص مخصص مع event=CUSTOM" }
    },
    "required": ["email", "event"]
  }
},
{
  "name": "kalam_get_audit_summary",
  "title": "[الأمن والرقابة] الملخص الرقابي السيادي",
  "annotations": {"title": "[الأمن والرقابة] الملخص الرقابي السيادي", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
  "description": "قراءة السجل السيادي الموحد غير القابل للتلاعب (AuditTrail) — أرقام الملخص التنفيذي (محو حسابات، حظر، تمييز تعليقات، توثيق ورُتب، تعديلات إعدادات، تغييرات محتوى، تغييرات بنية تحتية، أفعال MCP) مع آخر القيود الرقابية بالفاعل والمصدر (لوحة التحكم / بوابة MCP مع اسم العميل / التيرمينال السيادي / الموقع العام) والأداة/الأمر المنفذ والوصف العربي والمستهدف والسبب والدليل، لترشيح زمني (أيام) وبالتصنيف وبالمصدر — لتجاوب أسئلة مثل: ماذا فعل المشرفون خلال الأسبوع المنصرم؟ وماذا نفّذ Gemini عبر البوابة؟",
  "inputSchema": {
    "type": "object",
    "properties": {
      "days": { "type": "number", "description": "عدد الأيام الماضية للتحليل (افتراضي 7، أقصى 365)" },
      "category": { "type": "string", "enum": ["USER_SELF_ACTION", "ADMIN_MODERATION", "ADMIN_VIP_CHANGE", "SYSTEM_CONFIG_CHANGE", "CONTENT_CHANGE", "INFRASTRUCTURE_CHANGE", "MCP_ACTION"], "description": "ترشيح بالتصنيف — يُترك فارغًا لكل التصنيفات" },
      "source": { "type": "string", "enum": ["WEB", "MCP", "CLI", "PUBLIC"], "description": "ترشيح بمصدر التنفيذ: WEB لوحة التحكم | MCP بوابة الذكاء الاصطناعي | CLI التيرمينال السيادي | PUBLIC الموقع العام — يُترك فارغًا لكل القنوات" },
      "limit": { "type": "number", "description": "عدد القيود الأخيرة المفصلة في الاستجابة (افتراضي 20، أقصى 100)" }
    }
  }
},
{
  "name": "kalam_execute_hard_delete",
  "title": "[الأمن والرقابة] المحو السيادي الشامل لحساب",
  "annotations": {"title": "[الأمن والرقابة] المحو السيادي الشامل لحساب", readOnlyHint: false, destructiveHint: true},
  "description": "تنفيذ المحو السيادي الشامل لحساب مستخدم (GDPR Hard Delete): معاملة ذرّية واحدة تمحو كل تعليقاته وتصويتاته وتفاعلاته ورصيد أثره ومحفوظاته ومواضع قراءته ونقاشاته مع الذكاء الاصطناعي ومقترحاته وإشعاراته وجلساته وروابط Google ثم سجله الأساسي، مع حذف صوره من التخزين السحابي وقيد رقابي إلزامي بالسبب والدليل المصور داخل المعاملة نفسها. حساب صاحب المنصة محمي ولا يُمحى مطلقًا.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "email": { "type": "string", "description": "بريد الحساب المستهدف للمحو — إلزامي" },
      "reasonCode": { "type": "string", "enum": ["OFFICIAL_USER_REQUEST", "SEVERE_DIALOGUE_VIOLATION", "SECURITY_ABUSE"], "description": "تصنيف السبب الرسمي: OFFICIAL_USER_REQUEST طلب رسمي عبر اتصل بنا | SEVERE_DIALOGUE_VIOLATION مخالفة جسيمة لآداب الحوار | SECURITY_ABUSE إساءة أمنية — إلزامي" },
      "reason": { "type": "string", "description": "تفصيل السبب (نص الطلب أو المخالفة) — إلزامي (5 أحرف فأكثر) ويُحفظ في القيد الرقابي" },
      "evidenceUrl": { "type": "string", "description": "رابط لقطة الشاشة الدليلية (طلب المستخدم أو إثبات المخالفة) — إلزامي https" }
    },
    "required": ["email", "reasonCode", "reason", "evidenceUrl"]
  }
},
{
  "name": "kalam_generate_audit_pdf",
  "title": "[الأمن والرقابة] توليد التقرير الرقابي PDF",
  "annotations": {"title": "[الأمن والرقابة] توليد التقرير الرقابي PDF", readOnlyHint: false, destructiveHint: false},
  "description": "توليد التقرير الرقابي السيادي PDF بتنسيق عربي فاخر (ترويسة سيادية، ملخص تنفيذي بالأرقام، جدول تفصيلي بالقيود والسبب والدليل) لنطاق أسبوعي أو شهري، ورفعه إلى مجلد الأدلة المحمي وإرجاع رابط التنزيل الدائم.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "range": { "type": "string", "enum": ["weekly", "monthly"], "description": "نطاق التقرير: weekly آخر ٧ أيام (افتراضي) | monthly آخر ٣٠ يومًا" }
    }
  }
},  {
    name: "kalam_broadcast_notification",
    title: "[البث والإشعارات] المرسل المركزي الموحد للإشعارات",
    annotations: {title: "[البث والإشعارات] المرسل المركزي الموحد للإشعارات", readOnlyHint: false, destructiveHint: false},
    description:
      "المرسل المركزي الموحد للإشعارات: بث عام لكل القراء أو إشعار مخصص لمستخدم بعينه عبر القنوات الثلاث (جرس داخل الموقع + Web Push + بريد Resend) مع احترام تفضيلات كل قارئ، وخيار توثيق البث في سجل تحديثات المنصة الظاهر للقراء.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "عنوان الإشعار (3 أحرف فأكثر)" },
        details: { type: "string", description: "نص الإشعار (3 أحرف فأكثر)" },
        email: { type: "string", description: "بريد مستخدم لإشعار مخصص له وحده — اتركه فارغًا للبث للجميع" },
        url: { type: "string", description: "مسار يفتح عند النقر مثل /article/slug" },
        channels: {
          type: "string",
          enum: ["ALL", "IN_APP", "WEB_PUSH", "EMAIL"],
          description: "قنوات الإرسال (افتراضي ALL)",
        },
        asPlatformUpdate: { type: "boolean", description: "توثيق الإشعار في سجل تحديثات المنصة الظاهر للقراء" },
        kind: {
          type: "string",
          enum: ["FEATURE", "MAINTENANCE", "INTELLECTUAL", "ALERT"],
          description: "نوع التحديث عند توثيقه (افتراضي FEATURE)",
        },
      },
      required: ["title", "details"],
    },
  },
  {
    name: "kalam_get_user_notifications",
    title: "[البث والإشعارات] سجل إشعارات قارئ",
    annotations: {title: "[البث والإشعارات] سجل إشعارات قارئ", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "جلب وتدقيق سجل إشعارات أي مستخدم من الجدول المركزي الموحد: آخر الإشعارات بأنواعها وحالة قراءتها وعدد غير المقروء — لمساعدته إداريًا أو تتبع وصول التنبيهات إليه.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "بريد المستخدم المستهدف" },
        limit: { type: "number", description: "عدد الإشعارات (افتراضي 10، أقصى 50)" },
        unreadOnly: { type: "boolean", description: "جلب غير المقروء فقط" },
      },
      required: ["email"],
    },
  },
  {
    name: "kalam_audit_auth_gates",
    title: "[الأمن والرقابة] فحص بوابات المصادقة حيًا",
    annotations: {title: "[الأمن والرقابة] فحص بوابات المصادقة حيًا", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "فحص أمني حي لبوابات المصادقة: يجرّب نداءات مجهولة (بلا جلسة ولا كوكيز) على كل نقطة النهاية التفاعلية للمنصة العامة ويتحقق أنها مغلقة بإحكام (401/403) — التعليقات، تصويت التعليقات والمقالات، الحفظ، محاورة الذكاء الاصطناعي، المقترحات، الاشتراكات، الملف الشخصي، محو الحساب.",
    inputSchema: { type: "object", properties: {} },
  },


  /* ==================== ز) البنية التحتية — GitHub (v4.0.0) ==================== */
  {
    name: "gh_get_repo",
    title: "[البنية التحتية - GitHub] نظرة شاملة على المستودع",
    annotations: {title: "[البنية التحتية - GitHub] نظرة شاملة على المستودع", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "نظرة شاملة على أحد مستودعي المنصة على GitHub: المعلومات الأساسية والفرع الافتراضي وقائمة الفروع مع آخر SHA لكل فرع — نقطة البداية لأي عمل كودي.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string", enum: ["public", "admin"], description: "public الموقع العام (افتراضي) | admin لوحة الأدمن" } },
    },
  },
  {
    name: "gh_search_code",
    title: "[البنية التحتية - GitHub] بحث نصي في كود المستودعين",
    annotations: {title: "[البنية التحتية - GitHub] بحث نصي في كود المستودعين", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "بحث نصي فوري عن أي كلمة أو دالة أو نص داخل ملفات مستودع public أو admin أو كليهما معًا — يعيد المسارات المطابقة وأرقام الأسطر ومقتطف كل مطابقة دون قراءة الملفات واحدًا تلو الآخر. التنزيل من أرشيف الشجرة نفسه بلا اعتماد على فهرسة جيت هب، فالنتيجة دقيقة سطرًا بسطر لحظة البحث على أي فرع.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "الكلمة أو العبارة أو الدالة المبحوث عنها — إلزامي (مثل: NOTIFICATION_ASSETS أو getOrigin)",
        },
        repo: {
          type: "string",
          enum: ["public", "admin", "both"],
          description: "المستودع — افتراضي public، وboth يبحث في المستودعين معًا",
        },
        path: { type: "string", description: "تضييق البحث على مسار — مثال: src/lib أو src/app/api" },
        ref: { type: "string", description: "الفرع أو SHA — افتراضي main" },
        caseSensitive: { type: "boolean", description: "بحث حساس لحالة الأحرف — افتراضي false (يتجاهل الحالة)" },
        limit: { type: "number", description: "أقصى عدد ملفات نتائج لكل مستودع (افتراضي 20، أقصى 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "gh_list_tree",
    title: "[البنية التحتية - GitHub] استكشاف شجرة الملفات",
    annotations: {title: "[البنية التحتية - GitHub] استكشاف شجرة الملفات", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "استكشاف شجرة ملفات المستودع كاملة أو من مسار محدد — أسماء الملفات وأنواعها وأحجامها، لمعرفة مكان أي كود قبل قراءته أو تعديله.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        ref: { type: "string", description: "الفرع أو SHA — افتراضي main" },
        path: { type: "string", description: "تضييق على مسار — مثال: src/lib" },
      },
    },
  },
  {
    name: "gh_get_file",
    title: "[البنية التحتية - GitHub] قراءة ملف من المستودع",
    annotations: {title: "[البنية التحتية - GitHub] قراءة ملف من المستودع", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "قراءة ملف كامل من المستودع بمحتواه النصي وSHA الخاص به — الكود والإعدادات وprisma/schema.prisma وكل شيء.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        path: { type: "string", description: "مسار الملف — مثال: src/app/layout.tsx — إلزامي" },
        ref: { type: "string", description: "الفرع أو SHA — افتراضي main" },
      },
      required: ["path"],
    },
  },
  {
    name: "gh_save_file",
    title: "[البنية التحتية - GitHub] حفظ ملف في المستودع",
    annotations: {title: "[البنية التحتية - GitHub] حفظ ملف في المستودع", readOnlyHint: false, destructiveHint: false},
    description:
      "إنشاء أو تعديل أي ملف في المستودع بكوميت مباشر: مرر المسار والمحتوى الكامل الجديد ورسالة الكوميت — يعرف تلقائيًا أن الملف قائم (تحديث) أم جديد (إنشاء). النصوص والكود بترميز utf8 (الافتراضي)، والصور والأيقونات والخطوط والملفات الثنائية بترميز base64 (مثل og-default.png وأيقونات PWA) حتى 3MB. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        path: { type: "string", description: "مسار الملف — إلزامي" },
        content: { type: "string", description: "المحتوى الكامل الجديد — نص UTF-8 مع utf8 أو بيانات base64 خام مع base64 — إلزامي" },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          description: "utf8 نص (افتراضي) | base64 لرفع واستبدال الصور والأيقونات والملفات الثنائية مباشرة",
        },
        message: { type: "string", description: "رسالة الكوميت" },
        branch: { type: "string", description: "الفرع — افتراضي main" },
        sha: { type: "string", description: "SHA الملف إن كنت تملكه — يُجلب تلقائيًا إن غاب" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "gh_commit_files",
    title: "[البنية التحتية - GitHub] كوميت ذرّي متعدد الملفات",
    annotations: {title: "[البنية التحتية - GitHub] كوميت ذرّي متعدد الملفات", readOnlyHint: false, destructiveHint: false},
    description:
      "كوميت ذرّي واحد لعدة ملفات معًا عبر Git Trees API — للتعديلات المترابطة (مثل تحديث package.json مع كود المكتبة أو عدة صفحات معًا) فلا تُطلق إلا نشرة واحدة على Vercel بدل نشرة لكل ملف: كل ملف { path, content, encoding?, op? } حيث encoding utf8|base64 وop upsert|delete (حذف يستغني عن content). حتى 25 ملفًا و3MB للملف.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        message: { type: "string", description: "رسالة الكوميت — إلزامية" },
        branch: { type: "string", description: "الفرع — افتراضي main" },
        files: {
          type: "array",
          description: "الملفات — إلزامية، مثال: [{\"path\":\"src/app/x.tsx\",\"content\":\"...\"},{\"path\":\"package.json\",\"content\":\"...\",\"encoding\":\"utf8\"}]",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "مسار الملف" },
              content: { type: "string", description: "المحتوى (النص أو base64) — لا يلزم مع op=delete" },
              encoding: { type: "string", enum: ["utf8", "base64"], description: "utf8 (افتراضي) | base64 للثنائيات" },
              op: { type: "string", enum: ["upsert", "delete"], description: "upsert إنشاء/تعديل (افتراضي) | delete حذف الملف" },
            },
            required: ["path"],
          },
        },
      },
      required: ["message", "files"],
    },
  },
  {
    name: "gh_manage_pulls",
    title: "[البنية التحتية - GitHub] إدارة طلبات الدمج",
    annotations: {title: "[البنية التحتية - GitHub] إدارة طلبات الدمج", readOnlyHint: false, destructiveHint: false},
    description:
      "إدارة طلبات الدمج Pull Requests بين الفروع في مستودعي المنصة: list جلب الطلبات المفتوحة، get مراجعة طلب كامل بملفاته وpatchها وإحصاءاته، create فتح طلب من فرع إلى main، comment تدوين مراجعة، merge دمجه (merge | squash | rebase)، close إغلاقه دون دمج — مراجعة التعديلات الكبيرة قبل هبوطها في main. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        action: {
          type: "string",
          enum: ["list", "get", "create", "comment", "merge", "close"],
          description: "list جلب (افتراضي) | get مراجعة | create فتح | comment مراجعة نصية | merge دمج | close إغلاق",
        },
        number: { type: "string", description: "رقم الطلب — إلزامي مع get/comment/merge/close" },
        state: { type: "string", enum: ["open", "closed", "all"], description: "فلتر القائمة — افتراضي open" },
        title: { type: "string", description: "عنوان الطلب مع create" },
        head: { type: "string", description: "الفرع المصدر مع create" },
        base: { type: "string", description: "الفرع المستقبل مع create — افتراضي main" },
        body: { type: "string", description: "وصف الطلب مع create" },
        comment: { type: "string", description: "نص المراجعة مع comment" },
        merge_method: { type: "string", enum: ["merge", "squash", "rebase"], description: "طريقة الدمج — افتراضي merge" },
        commit_title: { type: "string", description: "عنوان كوميت الدمج المخصص مع merge" },
      },
    },
  },
  {
    name: "gh_delete_file",
    title: "[البنية التحتية - GitHub] حذف ملف من المستودع",
    annotations: {title: "[البنية التحتية - GitHub] حذف ملف من المستودع", readOnlyHint: false, destructiveHint: true},
    description: "حذف ملف من المستودع بكوميت موثق — يجلب SHA تلقائيًا ويرسل الحذف إلى الفرع المحدد. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        path: { type: "string", description: "مسار الملف — إلزامي" },
        message: { type: "string", description: "رسالة كوميت الحذف" },
        branch: { type: "string", description: "الفرع — افتراضي main" },
      },
      required: ["path"],
    },
  },
  {
    name: "gh_list_commits",
    title: "[البنية التحتية - GitHub] سجل الكوميتات",
    annotations: {title: "[البنية التحتية - GitHub] سجل الكوميتات", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "سجل الكوميتات الأحدث أولًا — بفلترة اختيارية بمسار ملف محدد لمعرفة من غيّر ماذا ومتى.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        path: { type: "string", description: "فلترة بملف محدد" },
        limit: { type: "number", description: "عدد الكوميتات (افتراضي 15، أقصى 50)" },
      },
    },
  },
  {
    name: "gh_get_diff",
    title: "[البنية التحتية - GitHub] مقارنة مرجعين",
    annotations: {title: "[البنية التحتية - GitHub] مقارنة مرجعين", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "مقارنة مرجعين (SHA أو فرعين أو main~3) — الكوميتات الفاصلة والملفات المتغيرة مع patch كل ملف: فرق دقيق قبل أي قرار دمج أو تراجع.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        base: { type: "string", description: "المرجع الأقدم — إلزامي" },
        head: { type: "string", description: "المرجع الأحدث — إلزامي" },
      },
      required: ["base", "head"],
    },
  },
  {
    name: "gh_create_branch",
    title: "[البنية التحتية - GitHub] إنشاء فرع جديد",
    annotations: {title: "[البنية التحتية - GitHub] إنشاء فرع جديد", readOnlyHint: false, destructiveHint: false},
    description: "إنشاء فرع جديد من فرع قائم (افتراضيًا من main) — لعمل تعديلات معزولة قبل دمجها. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        branch: { type: "string", description: "اسم الفرع الجديد — إلزامي" },
        from: { type: "string", description: "الفرع الأصل — افتراضي main" },
      },
      required: ["branch"],
    },
  },
  {
    name: "gh_merge_branch",
    title: "[البنية التحتية - GitHub] دمج فرع",
    annotations: {title: "[البنية التحتية - GitHub] دمج فرع", readOnlyHint: false, destructiveHint: false},
    description: "دمج فرع داخل فرع مباشرة على GitHub (base المستقبل ← head المصدر) بكوميت دمج موثق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        base: { type: "string", description: "الفرع المستقبل — إلزامي" },
        head: { type: "string", description: "الفرع المصدر — إلزامي" },
        message: { type: "string", description: "رسالة كوميت الدمج" },
      },
      required: ["base", "head"],
    },
  },
  {
    name: "gh_delete_branch",
    title: "[البنية التحتية - GitHub] حذف فرع",
    annotations: {title: "[البنية التحتية - GitHub] حذف فرع", readOnlyHint: false, destructiveHint: true},
    description:
      "حذف فرع من المستودع بعد انتهاء العمل منه (الفرع الافتراضي main محمي من الحذف رفضًا صريحًا). يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        branch: { type: "string", description: "اسم الفرع المراد حذفه — إلزامي" },
      },
      required: ["branch"],
    },
  },
  {
    name: "gh_dispatch_workflow",
    title: "[البنية التحتية - GitHub] تشغيل GitHub Actions يدويًا",
    annotations: {title: "[البنية التحتية - GitHub] تشغيل GitHub Actions يدويًا", readOnlyHint: false, destructiveHint: false},
    description: "تشغيل GitHub Actions يدويًا (workflow_dispatch) على فرع محدد مع مدخلات اختيارية — إطلاق أي مسار آلي معرف في المستودع.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        workflow: { type: "string", description: "اسم ملف الـworkflow — مثال: deploy.yml — إلزامي" },
        ref: { type: "string", description: "الفرع — افتراضي main" },
        inputs: { type: "object", description: "مدخلات الـworkflow" },
      },
      required: ["workflow"],
    },
  },
  {
    name: "gh_list_action_runs",
    title: "[البنية التحتية - GitHub] آخر تشغيلات Actions",
    annotations: {title: "[البنية التحتية - GitHub] آخر تشغيلات Actions", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "آخر تشغيلات GitHub Actions في المستودع: الحالة والنتيجة والفرع والكوميت ورابط التفاصيل.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        limit: { type: "number", description: "عدد التشغيلات (افتراضي 10، أقصى 30)" },
      },
    },
  },
  {
    name: "gh_get_action_run",
    title: "[البنية التحتية - GitHub] تفاصيل تشغيل Actions",
    annotations: {title: "[البنية التحتية - GitHub] تفاصيل تشغيل Actions", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "تفاصيل تشغيل Actions محدد: كل الـjobs وخطواتها وزمن كل خطوة ونتيجتها — تشخيص فشل البناء خطوة بخطوة.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        run_id: { type: "number", description: "معرف التشغيل من gh_list_action_runs — إلزامي" },
      },
      required: ["run_id"],
    },
  },
  {
    name: "gh_dependabot_alerts",
    title: "[البنية التحتية - GitHub] تنبيهات الأمان",
    annotations: {title: "[البنية التحتية - GitHub] تنبيهات الأمان", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "تنبيهات الأمان (Dependabot) للمستودع: الحزم المعرضة وشدة الخطورة والنطاق المصاب وأول إصدار مُصلح — بحالة مفتوحة افتراضيًا أو مؤرشفة.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", enum: ["public", "admin"], description: "المستودع — افتراضي public" },
        state: { type: "string", enum: ["open", "dismissed", "fixed", "all"], description: "حالة التنبيه — افتراضي open" },
      },
    },
  },

  /* ==================== ح) البنية التحتية — Vercel (v4.0.0) ==================== */
  {
    name: "vercel_list_deployments",
    title: "[البنية التحتية - Vercel] آخر النشرات",
    annotations: {title: "[البنية التحتية - Vercel] آخر النشرات", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "آخر نشرات أي مشروع من مشروعي المنصة: الحالة والهدف والإنتاج والكوميت ورابط المفتش — بفلترة بالإنتاج production.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        limit: { type: "number", description: "عدد النشرات (افتراضي 10، أقصى 30)" },
        target: { type: "string", enum: ["production", "preview"], description: "فلترة بالهدف" },
      },
    },
  },
  {
    name: "vercel_get_deployment",
    title: "[البنية التحتية - Vercel] تفاصيل نشرة محددة",
    annotations: {title: "[البنية التحتية - Vercel] تفاصيل نشرة محددة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "تفاصيل نشرة محددة: حالتها وهدفها والكوميت المرتبط والأسماء المستعارة (النطاقات) الموجهة إليها.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "معرف النشرة uid أو رابطها — إلزامي" } },
      required: ["id"],
    },
  },
  {
    name: "vercel_get_deployment_logs",
    title: "[البنية التحتية - Vercel] سجلات بناء نشرة",
    annotations: {title: "[البنية التحتية - Vercel] سجلات بناء نشرة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "سجلات بناء نشرة محددة (Build Logs) بالأسطر الزمنية — تشخيص فشل النشر سطرًا سطرًا.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "معرف النشرة — إلزامي" },
        limit: { type: "number", description: "أقصى أسطر معروضة (افتراضي 80، أقصى 300)" },
      },
      required: ["id"],
    },
  },
  {
    name: "vercel_redeploy",
    title: "[البنية التحتية - Vercel] إعادة نشر إنتاجي",
    annotations: {title: "[البنية التحتية - Vercel] إعادة نشر إنتاجي", readOnlyHint: false, destructiveHint: false},
    description:
      "إطلاق نشر إنتاج جديد فورًا لمشروع المنصة (من أحدث main افتراضيًا أو SHA محدد) — نفس زر Redeploy في اللوحة. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        ref: { type: "string", description: "الفرع أو SHA — افتراضي main" },
      },
    },
  },
  {
    name: "vercel_rollback",
    title: "[البنية التحتية - Vercel] تراجع الإنتاج لنسخة سابقة",
    annotations: {title: "[البنية التحتية - Vercel] تراجع الإنتاج لنسخة سابقة", readOnlyHint: false, destructiveHint: false},
    description:
      "التراجع لنسخة سابقة: محاولة التراجع الفوري الرسمي أولًا، وإن لم يتاح يطلق نشرًا إنتاجيًا جديدًا من SHA النسخة المستهدفة — النتيجة واحدة: الإنتاج يعود لكود النسخة القديمة. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        id: { type: "string", description: "معرف النشرة القديمة المستهدفة — إلزامي" },
      },
      required: ["id"],
    },
  },
  {
    name: "vercel_list_env",
    title: "[البنية التحتية - Vercel] متغيرات البيئة",
    annotations: {title: "[البنية التحتية - Vercel] متغيرات البيئة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "متغيرات بيئة المشروع من Vercel مباشرة: الأسماء والأهداف والقيم — مخفية افتراضيًا وتُكشف بـreveal=true (تعامل بحرص).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        reveal: { type: "boolean", description: "كشف القيم الحقيقية — افتراضي false" },
      },
    },
  },
  {
    name: "vercel_set_env",
    title: "[البنية التحتية - Vercel] إضافة أو تعديل متغير بيئة",
    annotations: {title: "[البنية التحتية - Vercel] إضافة أو تعديل متغير بيئة", readOnlyHint: false, destructiveHint: false},
    description:
      "إضافة أو تعديل متغير بيئة على المشروع (upsert): إنه موجود يُحدَّث وإنه جديد يُنشأ — يحتاج إعادة نشر بعده ليصبح حيًا. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        key: { type: "string", description: "اسم المتغير — إلزامي" },
        value: { type: "string", description: "القيمة — إلزامي" },
        target: { type: "string", description: "البيئات مفصولة بفاصلة: production,preview,development — الافتراضي الثلاثة" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "vercel_delete_env",
    title: "[البنية التحتية - Vercel] حذف متغير بيئة",
    annotations: {title: "[البنية التحتية - Vercel] حذف متغير بيئة", readOnlyHint: false, destructiveHint: true},
    description: "حذف متغير بيئة من المشروع بالاسم — يُوثق في سجل التدقيق. يحتاج إعادة نشر بعده ليأخذ مفعوله.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        key: { type: "string", description: "اسم المتغير — إلزامي" },
      },
      required: ["key"],
    },
  },
  {
    name: "vercel_domains",
    title: "[البنية التحتية - Vercel] إدارة النطاقات",
    annotations: {title: "[البنية التحتية - Vercel] إدارة النطاقات", readOnlyHint: false, destructiveHint: true},
    description: "إدارة نطاقات المشروع: list عرضها وحالة تحققها | add إضافة نطاق جديد | remove إزالته.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        action: { type: "string", enum: ["list", "add", "remove"], description: "الفعل — افتراضي list" },
        domain: { type: "string", description: "النطاق — إلزامي مع add|remove" },
      },
    },
  },
  {
    name: "vercel_project_info",
    title: "[البنية التحتية - Vercel] إعدادات المشروع",
    annotations: {title: "[البنية التحتية - Vercel] إعدادات المشروع", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "إعدادات المشروع من Vercel: الاسم والفريموركس وأوامر البناء والتثبيت وآخر نشرة.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" } },
    },
  },
  {
    name: "vercel_get_crons",
    title: "[البنية التحتية - Vercel] المهام المجدولة",
    annotations: {title: "[البنية التحتية - Vercel] المهام المجدولة", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "المهام المجدولة (Cron Jobs) للمنصة كما هي معرفة في vercel.json بمستودع المشروع — المسارات والجداول الزمنية.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" } },
    },
  },
  {
    name: "vc_runtime_logs",
    title: "[البنية التحتية - Vercel] سجلات التشغيل الحية",
    annotations: {title: "[البنية التحتية - Vercel] سجلات التشغيل الحية", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "سجلات تشغيل النشرة الحية (Runtime / Function Logs) من Vercel — أحداث دوال الخادم بعد الجاهزية: أخطاء الدوال وتعطل الـMiddleware وstdout الخلفي — لتشخيص العطل قبل وصوله لكود التطبيق: جرّبه عند 500 فجائي أو خطأ MIDDLEWARE_INVOCATION_FAILED. يجلب مجرى أحداث النشرة الرسمي ويفصل أحداث التشغيل عن البناء (includeBuild=true لعرض البناء أيضًا) — الافتراضي أحدث نشرة إنتاج للمشروع.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", enum: ["public", "admin"], description: "المشروع — افتراضي public" },
        id: { type: "string", description: "معرف نشرة محددة (uid أو رابطها) — افتراضيًا أحدث نشرة إنتاج" },
        limit: { type: "number", description: "أقصى أحداث معروضة (افتراضي 80، أقصى 300)" },
        includeBuild: { type: "boolean", description: "إدراج أحداث البناء كذلك — افتراضي false (تشغيل فقط)" },
        filter: { type: "string", description: "فلترة نصية داخل سطر السجل — مثل Error أو اسم الدالة" },
      },
    },
  },
  {
    name: "inspect_live_page",
    title: "[فحص حي] فحص صفحة منشورة حيًا",
    annotations: {title: "[فحص حي] فحص صفحة منشورة حيًا", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "فحص حي لأي رابط منشور (الموقع العام أو اللوحة أو أي رابط) بعد أي نشر: كود الاستجابة وسلسلة التحويلات والترويسات المهمة والعنوان <title> ووصف الميتا وكل وسوم OG وTwitter والرابط الكانوني وأول عناوين H1 وحجم HTML — تأكيد فوري أن الإنتاج يخدم ما هو متوقع (meta og:image الجديدة مثلًا).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "الرابط الكامل https://… — إلزامي" },
      },
      required: ["url"],
    },
  },

  {
    name: "test_api_endpoint",
    title: "[فحص حي] اختبار مسار API حي على الإنتاج",
    annotations: {title: "[فحص حي] اختبار مسار API حي على الإنتاج", readOnlyHint: false, destructiveHint: true},
    description:
      "تجربة أي مسار API حي في الموقع العام أو اللوحة مباشرة على الإنتاج: GET أو POST أو PUT أو PATCH أو DELETE بجسم JSON وترويسات اختيارية، ويعيد كود الاستجابة ومدة الاستجابة والترويسات المهمة والـJSON الناتج كاملًا — للتأكد الفوري من عمل أي مسار برمجي بعد النشر. لا يمرر جلسة إدارية — المسارات المحمية ستعيد 401 كما يراها أي مجهول، وهذا بالضبط ما يجعله فحصًا أمينًا للبوابات.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["public", "admin"],
          description: "الموقع المستهدف — public الموقع العام (افتراضي) | admin لوحة التحكم",
        },
        path: {
          type: "string",
          description: "مسار الـAPI مثل /api/comments أو /api/ai/discuss — إلزامي إلا إذا مررت fullUrl",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          description: "طريقة الطلب — افتراضي GET",
        },
        body: {
          type: "object",
          description: "جسم الطلب ككائن JSON — يُرسل مع Content-Type: application/json (يُتجاهل في GET)",
        },
        headers: {
          type: "object",
          description: "ترويسات إضافية اختيارية مثل {\"x-worker-secret\":\"…\"}",
        },
        fullUrl: {
          type: "string",
          description: "رابط كامل بديل عن target+path — يجب أن يكون https عامًا (يُرفض localhost والعناوين الداخلية)",
        },
        timeoutMs: { type: "number", description: "مهلة الانتظار بالمللي ثانية (افتراضي 15000، أقصى 30000)" },
      },
    },
  },

  /* ==================== ط) قاعدة البيانات Neon (v4.0.0) ==================== */
  {
    name: "db_inspect_schema",
    title: "[قاعدة البيانات] فحص مخطط Neon",
    annotations: {title: "[قاعدة البيانات] فحص مخطط Neon", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "فحص مخطط قاعدة Neon الحية: كل الجداول بأعداد صفوفها التقريبية وأعمدتها وأحجامها على القرص — أو تفصيل جدول واحد بأعمدته كاملة.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string", description: "جدول محدد لتفصيل أعمدته — يُترك فارغًا لعرض الجداول كلها" } },
    },
  },
  {
    name: "db_query",
    title: "[قاعدة البيانات] الاستعلام التنفيذي المؤمن",
    annotations: {title: "[قاعدة البيانات] الاستعلام التنفيذي المؤمن", readOnlyHint: false, destructiveHint: true},
    description:
      "الاستعلام التنفيذي المؤمن على Neon — CRUD كامل وأوامر الهيكلة المقننة: وضع select للقراءة (SELECT/WITH/SHOW/EXPLAIN بسقف صفوف)، ووضع execute للكتابة (INSERT/UPDATE/DELETE) وأيضًا DDL المقيّد (ALTER TABLE وCREATE TABLE وCREATE INDEX وDROP INDEX) لتطبيق تعديل prisma/schema.prisma على قاعدة Neon فورًا — بإقرار نصي إلزامي confirm='أؤقر التنفيذ'. عبارة واحدة، وعبارات تدمير القاعدة كلها محجوبة نهائيًا، وكل نداء يُوثق في السجل؛ بعد DDL تحقق عبر db_inspect_schema.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "العبارة — مثال: SELECT count(*) FROM \"Article\" أو ALTER TABLE \"Article\" ADD COLUMN \"newField\" TEXT — عبارة واحدة بلا ;" },
        mode: { type: "string", enum: ["select", "execute"], description: "يُستنتج تلقائيًا إن غاب" },
        confirm: { type: "string", description: "الإقرار النصي 'أؤقر التنفيذ' — إلزامي في وضع execute (كتابة وDDL)" },
        limit: { type: "number", description: "سقف صفوف العرض في select (افتراضي 100، أقصى 200)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "db_migrations",
    title: "[قاعدة البيانات] حالة مهاجرات Prisma",
    annotations: {title: "[قاعدة البيانات] حالة مهاجرات Prisma", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description: "حالة مهاجرات Prisma على قاعدة الإنتاج: آخر المهاجرات المطبقة وزمنها وأي مهاجر معلق أو فاشل.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kalam_get_audit_log",
    title: "[الأمن والرقابة] سجل التدقيق الخام",
    annotations: {title: "[الأمن والرقابة] سجل التدقيق الخام", readOnlyHint: true, destructiveHint: false, idempotentHint: true},
    description:
      "سجل التدقيق الخام (AuditLog) بفلاتر حرّة: آخر العمليات الموثقة بأفعالها وكياناتها وIP الفاعل وmeta الكاملة — السجل الذي تكتب فيه كل الأدوات المغيّرة.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "فلترة بنص الفعل — مثال: mcp.gh_save_file" },
        hours: { type: "number", description: "آخر كم ساعة (افتراضي 24، أقصى 720)" },
        limit: { type: "number", description: "عدد السطور (افتراضي 50، أقصى 200)" },
      },
    },
  },

  /* ==================== ي) الخدمات السيادية (v4.0.0) ==================== */
  {
    name: "cloudinary_upload_file",
    title: "[الخزنة السحابية] رفع ملف إلى Cloudinary",
    annotations: {title: "[الخزنة السحابية] رفع ملف إلى Cloudinary", readOnlyHint: false, destructiveHint: false},
    description:
      "رفع ملف إلى Cloudinary مباشرة: صورة (image) أو ملف خام (raw) أو فيديو — بقرار file إما رابط مباشر أو بيانات base64، مع مجلد ومعرف عام اختياريين. يُرجع الرابط الآمن ورابط التسليم المحسّن للصور. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "رابط مباشر https:// أو data:image/png;base64,.... — إلزامي" },
        resource: { type: "string", enum: ["image", "raw", "video"], description: "نوع المورد — افتراضي image" },
        public_id: { type: "string", description: "المعرف العام النهائي (بدون الامتداد)" },
        folder: { type: "string", description: "المجلد — يُنشأ تلقائيًا عند أول رفع" },
        invalidate: { type: "boolean", description: "إبطال كاش CDN بعد الرفع" },
      },
      required: ["file"],
    },
  },
  {
    name: "cloudinary_rename_asset",
    title: "[الخزنة السحابية] إعادة تسمية أصل سحابي",
    annotations: {title: "[الخزنة السحابية] إعادة تسمية أصل سحابي", readOnlyHint: false, destructiveHint: false},
    description:
      "إعادة تسمية/نقل أصل Cloudinary إلى معرف عام جديد (حتى بين مجلدات مختلفة) — تنظيم المكتبة دون إعادة رفع. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        from_public_id: { type: "string", description: "المعرف الحالي — إلزامي" },
        to_public_id: { type: "string", description: "المعرف الجديد — إلزامي" },
        resource: { type: "string", enum: ["image", "raw", "video"], description: "نوع المورد — افتراضي image" },
        invalidate: { type: "boolean", description: "إبطال كاش CDN" },
      },
      required: ["from_public_id", "to_public_id"],
    },
  },
  {
    name: "resend_send_email",
    title: "[البريد] إرسال بريد مخصص عبر Resend",
    annotations: {title: "[البريد] إرسال بريد مخصص عبر Resend", readOnlyHint: false, destructiveHint: false},
    description:
      "إرسال بريد مخصص عبر Resend من نطاق المنصة: إلى أي عناوين مفصولة بفاصلة، بنص HTML أو خام، من عنوان المرسل المعتمد افتراضيًا — لرسائل مباشرة خارج قوالب الإشعارات. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "عناوين المستلمين مفصولة بفاصلة — إلزامي" },
        subject: { type: "string", description: "عنوان الرسالة — إلزامي" },
        html: { type: "string", description: "متن HTML (بديل عن text)" },
        text: { type: "string", description: "متن خام (بديل عن html)" },
        from: { type: "string", description: "عنوان مرسل بديل — الافتراضي من تكوين المنصة" },
        reply_to: { type: "string", description: "عنوان الرد" },
      },
      required: ["to", "subject"],
    },
  },
  {
    name: "resend_manage",
    title: "[البريد] إدارة نطاقات البريد وحالة التسليم",
    annotations: {title: "[البريد] إدارة نطاقات البريد وحالة التسليم", readOnlyHint: false, destructiveHint: true},
    description:
      "إدارة نطاقات البريد في Resend بالكامل وحالة تسليم الرسائل: list عرض النطاقات وحالة تحققها | get تفاصيل نطاق وسجلات DNS المطلوبة | verify إطلاق التحقق من سجلات DNS لنطاق (مثل ziadamr.me بعد ضبط DNS) | create إضافة نطاق جديد (يرجع سجلات DNS اللازمة) | delete حذف نطاق | email_status متابعة حالة تسليم بريد بعينه (وصل delivered أم ارتد bounced أم معلق) بمعرفه من resend_send_email — يُحدد النطاق بـ domain_id أو باسمه domain مباشرة. التعديلات تُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "get", "verify", "create", "delete", "email_status"],
          description:
            "الفعل — افتراضي list؛ email_status لفحص حالة تسليم رسالة أُرسلت سابقًا",
        },
        domain_id: { type: "string", description: "معرف النطاق من action=list — بديل عن domain" },
        domain: { type: "string", description: "اسم النطاق مثل ziadamr.me — إلزامي مع create ويسبتدل domain_id في get/verify/delete" },
        region: { type: "string", description: "منطقة الإرسال مع create (اختياري — مثل eu-west-1 أو us-east-1)" },
        email_id: { type: "string", description: "معرف الرسالة من resend_send_email (يبدأ بـ uuid) — إلزامي مع email_status" },
      },
    },
  },
  {
    name: "kalam_push_admin_custom",
    title: "[البث والإشعارات] إشعار Push مخصص لصاحب المنصة",
    annotations: {title: "[البث والإشعارات] إشعار Push مخصص لصاحب المنصة", readOnlyHint: false, destructiveHint: false},
    description:
      "إشعار Push مخصص لأجهزة صاحب المنصة المسجلة (هاتفه وحاسوبه) بأي عنوان ومتن ورابط — تنبيهات شخصية خارج قنوات الأمن الآلية. يُوثق في سجل التدقيق.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "العنوان — إلزامي" },
        body: { type: "string", description: "المتن — إلزامي" },
        url: { type: "string", description: "الرابط الذي يفتح عند الضغط — افتراضي /" },
        tag: { type: "string", description: "وسم تجميع الإشعارات" },
      },
      required: ["title", "body"],
    },
  },

];
