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
export const MCP_SERVER_VERSION = "3.0.0";

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
          enum: [
            "ban",
            "unban",
            "adjust_impact",
            "reset_identity",
            "list_logins",
            "revoke_logins",
          ],
          description:
            "ban حظر | unban فك الحظر | adjust_impact منح/خصم أثر | reset_identity تصفير الهوية المخصصة | list_logins فحص دخولات Google وجلساته على المنصة العامة | revoke_logins إبطال جلساته وإجباره على إعادة الدخول",
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
    name: "manage_social_graph",
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
    name: "manage_push_subscriptions",
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
    description:
      "ذرات حساب الإدارة نفسه: نظرة شاملة على حسابات الأدمن وجلسات اللوحة الحية بأجهزتها وعناوينها والأجهزة الموثوقة وحالة التحقق الثنائي، مع إبطال أي جلسة، وإزالة جهاز موثوق، وتغيير كلمة المرور (يتطلب كلمة المرور الحالية للتحقق).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["overview", "revoke_session", "remove_device", "change_password"],
          description:
            "overview نظرة شاملة (افتراضي) | revoke_session إبطال جلسة | remove_device إزالة جهاز موثوق | change_password تغيير كلمة المرور",
        },
        sessionId: { type: "string", description: "معرف الجلسة — إلزامي مع revoke_session" },
        deviceId: { type: "string", description: "معرف الجهاز — إلزامي مع remove_device" },
        currentPassword: { type: "string", description: "كلمة المرور الحالية — إلزامية مع change_password للتحقق" },
        newPassword: { type: "string", description: "كلمة المرور الجديدة — إلزامية مع change_password" },
      },
    },
  },
  {
    name: "manage_discussion_quota",
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
    description:
      "الفحص الذاتي الشامل للمنصة في استدعاء واحد — كشف الاستدلالات المقلقة قبل أن تتحول إلى مشاكل: مقالات مجدولة حان وقتها ولم تُنشر بعد (تأخر مهمة الكرون)، مقاطع صوتية عالقة في المعالجة أو فشلت، مسودات مهجورة، تعليقات معلقة قديمة أو مبلَّغ عنها، رسائل تواصل ومقترحات غير معالجة، تنبيهات أمنية غير محسومة ودرجاتها، محاولات دخول فاشلة آخر 24 ساعة وقواعد IP النشطة، تقارير أعطال المستخدمين وعدد تكرارها وآخرها، قارئون محظورون، اشتراكات إشعارات ميتة، وزمن استجابة قاعدة البيانات مقاسًا فعليًا. تُعاد مع حكم نهائي: سليمة أم تحتاج نظر، وقائمة رموز للمشاكل.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "run_maintenance",
    description:
      "تشغيل مهام التشغيل يدويًا فورًا دون انتظار الكرون: فعل publish_scheduled ينفذ نفس منطق مهمة Vercel المجدولة (3:30 فجرًا) الآن — يقلب كل مقال مجدول حان وقته إلى منشور فعليًا ويضبط وقت النشر ويعيد تنشيط كاش الصفحة الرئيسية وصفحات المقالات والأقسام المعنية، ثم يعيد قائمة بما نُشر. استدعِها إذا رصد الفحص الذاتي مقالات مجدولة متأخرة، أو إذا أراد الزعيم نشرًا لحظيًا في تمام الوقت الذي يختاره.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["publish_scheduled"],
          description: "publish_scheduled نشر كل المجدول المستحق الآن (الفعل الوحيد المتاح حاليًا)",
        },
      },
    },
  },
  {
    name: "manage_comment_votes",
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
  "description": "نبض النظام الحي الشامل: صحة قاعدة Neon PostgreSQL (زمن الاستجابة، الاتصالات النشطة مقابل السقف الأقصى، حجم القاعدة، إصدار المحرك)، لقطة حركة آخر 60 دقيقة (إجمالي الطلبات والأخطاء والمعدل الدقيق وأكثر المسارات مرورًا وتوزيع الأجهزة والدول)، نبض أخطاء التشغيل الأخيرة، مع طابع لحظة القياس.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
},
{
  "name": "get_traffic_log",
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
  "description": "حصص واستهلاك الواجهات الخارجية اليومي وآخر 7 أيام: محاورة Gemini النصية، توليد الصوت Gemini TTS، تسليم بريد Resend (مع حالة النطاقات من API رسمي عند توفر المفتاح)، وتخزين الوسائط Cloudinary (الخطة ورصيد الاستخدام والتخزين والباندودث وعدد الأصول).",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
},
{
  "name": "get_site_config",
  "description": "قراءة التكوين السيادي للمنصة من جدول SiteConfig: الهوية والعلامة (الاسم والوثائق والتذييل وروابط التواصل)، النصوص (الترحيب وشرائح التهيئة وشارة المحاور وتنويهه)، مفاتيح الميزات (المحاورة الذكية والتعليقات والمشغل الصوتي وقناة أهل الكلمة)، ومعايير اقتصاد الأثر (الأوزان والعتبة) — كله أو تصنيفًا أو مفتاحًا.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": [
          "BRANDING",
          "TEXTS",
          "FLAGS",
          "IMPACT"
        ],
        "description": "تصفية بتصنيف واحد — تُترك فارغة للكل"
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
  "name": "kalam_assign_user_vip",
  "description": "منح أو تحديث تمييز حساب مميز (VIP) لأي قارئ: توثيق الحساب مع شارة نصية مخصصة ولون سداسي ورتبة وظيفية وسبب إلزامي وحزم صلاحيات دقيقة (حصة ذكاء غير محدودة، تجاوز حدود المعدل، قناة أهل الكلمة، تثبيت ذاتي للتعليقات، إطار تعليق فخم، ميزات تجريبية) ورصيد أثر ترحيبي فوري — مع إطلاق إشعارات التهنئة (جرس + بث + بريد) وتوثيق كامل في سجل التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "email": { "type": "string", "description": "بريد القارئ المستهدف — إلزامي" },
      "badgeTitle": { "type": "string", "description": "مسمى الشارة الظاهر بجانب اسمه مثل «كاتب ضيف» — إلزامي (2-40 حرفًا)" },
      "badgeColor": { "type": "string", "description": "لون الشارة السداسي مثل #D97706 (افتراضي #7C3AED)" },
      "reason": { "type": "string", "description": "سبب منح التمييز — إلزامي، يُحفظ في السجل ويظهر في إشعار المستخدم" },
      "role": { "type": "string", "enum": ["USER", "MODERATOR", "EDITOR", "ADMIN"], "description": "الرتبة الوظيفية (اختياري — الافتراضي بلا تغيير)" },
      "welcomePoints": { "type": "number", "description": "رصيد أثر ترحيبي فوري 0-10000 (اختياري)" },
      "privileges": {
        "type": "object",
        "description": "مفاتيح الصلاحيات الممنوحة (كل مفتاح true عند المنح)",
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
    "required": ["email", "badgeTitle", "reason"]
  }
},
{
  "name": "kalam_manage_verification",
  "description": "إدارة توثيق الحسابات السيادية بثلاثة أفعال: check لفحص حالة توثيق أي حساب وشاراته وتصنيفه وسبب منحه، grant لمنح توثيق فقط بنوع محدد (SOVEREIGN سيادي حصري، ADMIN_STAFF طاقم الإدارة، IMPACT_ELITE نخبة أهل الكلمة، VIP_GRANT منح يدوي، GUEST_AUTHOR كاتب ضيف، COMMUNITY استحقاق مجتمعي) وشارة مخصصة، revoke لسحب التوثيق كليًا بسبب إلزامي — كل فعل يُشعِر المستخدم فورًا ويُوثق في دفتر التدقيق.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["check", "grant", "revoke"], "description": "check فحص | grant منح | revoke سحب — إلزامي" },
      "email": { "type": "string", "description": "بريد الحساب المستهدف — إلزامي" },
      "verifiedType": { "type": "string", "enum": ["SOVEREIGN", "ADMIN_STAFF", "IMPACT_ELITE", "VIP_GRANT", "GUEST_AUTHOR", "COMMUNITY"], "description": "نوع التوثيق مع grant (افتراضي VIP_GRANT)" },
      "badgeTitle": { "type": "string", "description": "مسمى الشارة مع grant (افتراضي «حساب موثّق»)" },
      "badgeColor": { "type": "string", "description": "لون الشارة السداسي مع grant (افتراضي #2563EB)" },
      "reason": { "type": "string", "description": "السبب — إلزامي مع grant وrevoke، يظهر في إشعار المستخدم" }
    },
    "required": ["action", "email"]
  }
},
{
  "name": "kalam_dispatch_vip_notification",
  "description": "إطلاق إشعار توثيق وتمييز فوري لأي مستخدم عبر القنوات الثلاث معًا: إشعار داخلي في جرس المنصة، بث ويب فوري لهاتفه، وبريد إلكتروني مصمم عبر Resend — بأحداث جاهزة (منح شارة، بلوغ أهل الكلمة، تعديل مزايا، سحب توثيق) أو نص مخصص، مع تسجيل قنوات التسليم في سجل الأحداث الحي لمركز نشاط الأدمن.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "email": { "type": "string", "description": "بريد المستخدم المستهدف — إلزامي" },
      "event": { "type": "string", "enum": ["GRANTED", "ELITE", "MODIFIED", "REVOKED", "CUSTOM"], "description": "نوع الحدث — GRANTED منح شارة | ELITE أهل الكلمة | MODIFIED تعديل مزايا | REVOKED سحب | CUSTOM نص مخصص" },
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
  "description": "قراءة السجل السيادي غير القابل للتلاعب (AuditTrail) — أرقام الملخص التنفيذي (محو حسابات، حظر، تمييز تعليقات، توثيق ورُتب، تعديلات إعدادات) مع آخر القيود الرقابية بالفاعل والمستهدف والسبب والدليل، لترشيح زمني (أيام) وبالتصنيف (USER_SELF_ACTION | ADMIN_MODERATION | ADMIN_VIP_CHANGE | SYSTEM_CONFIG_CHANGE) — لتجاوب أسئلة مثل: ماذا فعل المشرفون خلال الأسبوع المنصرم؟",
  "inputSchema": {
    "type": "object",
    "properties": {
      "days": { "type": "number", "description": "عدد الأيام الماضية للتحليل (افتراضي 7، أقصى 365)" },
      "category": { "type": "string", "enum": ["USER_SELF_ACTION", "ADMIN_MODERATION", "ADMIN_VIP_CHANGE", "SYSTEM_CONFIG_CHANGE"], "description": "ترشيح بالتصنيف — يُترك فارغًا لكل التصنيفات" },
      "limit": { "type": "number", "description": "عدد القيود الأخيرة المفصلة في الاستجابة (افتراضي 20، أقصى 100)" }
    }
  }
},
{
  "name": "kalam_execute_hard_delete",
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
  "description": "توليد التقرير الرقابي السيادي PDF بتنسيق عربي فاخر (ترويسة سيادية، ملخص تنفيذي بالأرقام، جدول تفصيلي بالقيود والسبب والدليل) لنطاق أسبوعي أو شهري، ورفعه إلى مجلد الأدلة المحمي وإرجاع رابط التنزيل الدائم.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "range": { "type": "string", "enum": ["weekly", "monthly"], "description": "نطاق التقرير: weekly آخر ٧ أيام (افتراضي) | monthly آخر ٣٠ يومًا" }
    }
  }
},
];
