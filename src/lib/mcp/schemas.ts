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
export const MCP_SERVER_VERSION = "2.0.0";

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

  /* ==================== و) المستخدمون والقراء ==================== */
  {
    name: "list_users",
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
    description:
      "السيادة الكاملة على حساب قارئ: حظره نهائيًا بسبب موثق أو فك حظره، أو منح/خصم رصيد أثر (من ±1 إلى ±5000 بسبب يُوثَّق في سجل الأثر وتُعاد حساب رتبته الفكرية آليًا)، أو تصفير هويته المخصصة (الاسم والصورة والنبذة) عائدًا إياه لحالة Google الأصلية عند الانتهاك.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "معرف المستخدم — إلزامي" },
        action: {
          type: "string",
          enum: ["ban", "unban", "adjust_impact", "reset_identity"],
          description: "ban حظر | unban فك الحظر | adjust_impact منح/خصم أثر | reset_identity تصفير الهوية المخصصة",
        },
        reason: {
          type: "string",
          description: "السبب الموثق — إلزامي مع ban وadjust_impact (يُسجل في سجل الأثر/التدقيق)",
        },
        delta: {
          type: "number",
          description: "عدد النقاط مع adjust_impact — موجبة للمنح وسالبة للخصم (±1 إلى ±5000)",
        },
      },
      required: ["userId", "action"],
    },
  },

  /* ==================== ز) القنوات الخاصة والحوكمة ==================== */
  {
    name: "list_and_handle_proposals",
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
    description:
      "صلاحيات التعليق المتقدمة: تمييز تعليق «فكريًا ملهمًا» (يثبته أعلى حوار المقال وينح به صاحبه +30 رصيد أثر مع إشعار داخلي وويب فوري) أو إلغاء التمييز، أو تحرير نص التعليق بعلامة التحرير الإداري، أو حظر كاتب التعليق نهائيًا مع رفض كل تعليقاته المعلقة.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["inspire", "uninspire", "edit", "ban_author"],
          description:
            "inspire تمييز ملهم (+30) | uninspire إلغاء التمييز | edit تحرير النص | ban_author حظر الكاتب نهائيًا",
        },
        commentId: { type: "string", description: "معرف التعليق — إلزامي" },
        content: { type: "string", description: "النص الجديد — إلزامي مع edit" },
        banReason: { type: "string", description: "سبب الحظر مع ban_author (افتراضي: مخالفة أدب الحوار)" },
      },
      required: ["action", "commentId"],
    },
  },

  /* ==================== ح) البث والإشعارات وتحديثات المنصة ==================== */
  {
    name: "broadcast_notification",
    description:
      "مركز الإشعارات الجماهيري: بث إشعار لكل القراء غير المحظورين (أو إشعار مخصص لمستخدم بعينه) عبر جرس المنصة الداخلي وإشعار الويب الفوري لهواتفهم معًا، مع خيار توثيق البث في سجل تحديثات المنصة الظاهر للقراء — وجلب آخر التحديثات الموثقة أو حذف سجل منها.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["send", "list_updates", "delete_update"],
          description: "send إرسال (افتراضي) | list_updates جلب سجل التحديثات | delete_update حذف سجل",
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
        id: { type: "string", description: "معرف سجل التحديث — إلزامي مع delete_update" },
        limit: { type: "number", description: "عدد نتائج list_updates (افتراضي 12)" },
      },
    },
  },

  /* ==================== ط) الإعدادات السيادية ==================== */
  {
    name: "manage_system_settings",
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

  /* ==================== ي) الأمن والنبض الحي ==================== */
  {
    name: "manage_security",
    description:
      "مركز أمن المنصة: نظرة شاملة على آخر التنبيهات الأمنية ومحاولات الدخول الفاشلة وقواعد IP وسجل تدقيق اللوحة، مع حلّ التنبيهات، وإضافة قاعدة سماح ALLOW أو حجب DENY لأي عنوان IP أو إزالة قاعدة قائمة.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["overview", "resolve_alert", "add_ip_rule", "remove_ip_rule"],
          description: "overview نظرة شاملة (افتراضي) | resolve_alert حل تنبيه | add_ip_rule إضافة قاعدة | remove_ip_rule إزالتها",
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
      },
    },
  },
  {
    name: "get_live_activity",
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
];
