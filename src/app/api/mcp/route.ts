import { timingSafeEqual } from "crypto";
import {
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/schemas";
import { executeMcpTool, McpToolError, type McpArgs } from "@/lib/mcp/executors";
import { getClientIp } from "@/lib/guard";
import { getOrigin, verifyOAuthToken } from "@/lib/mcp/oauth";

/**
 * ============================================================
 * خادم بروتوكول سياق النموذج السيادي — Model Context Protocol
 * ============================================================
 * بوابة HTTPS آمنة تمنح الوكيل السحابي Gemini Spark (عبر Connected Apps)
 * صلاحيات إدارية سيادية كاملة على منصة «كلام له لازمة» وقاعدة Neon.
 *
 * المواصفات: MCP Streamable HTTP فوق JSON-RPC 2.0:
 *   POST  /api/mcp   — الرسائل (initialize / tools/list / tools/call / ping)
 *   GET   /api/mcp   — 405 (لا توجد قناة SSE — استجابات JSON نقية)
 *   OPTIONS /api/mcp — فحص CORS المسبق للعملاء المتصفحية
 *
 * الأمان — ممرّان متكافئان:
 *   1. الوضع الساكن: Authorization: Bearer <GEMINI_SPARK_MCP_SECRET>
 *      بمقارنة زمنية ثابتة تمنع هجمات قياس التوقيت (للاختبارات والاتصال المباشر)
 *   2. بروتوكول OAuth 2.0 القياسي (المطلوب لـ Gemini Connected Apps):
 *      رمز وصول JWT صادر عن /api/mcp/oauth/token عبر تدفق رمز التفويض + PKCE
 *      — الاكتشاف من /.well-known/oauth-protected-resource
 * 401 تعيد ترويسة WWW-Authenticate مع resource_metadata ليربدأ العميل
 * رقصة الاكتشاف القياسية تلقائيًا. الخادم عديم الحالة (Stateless)
 * — صالح تمامًا لبيئة Vercel Serverless.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

/* ============================ الأمان ============================ */

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;

  /* الممر 1: السرّ الساكن — مقارنة زمنية ثابتة */
  const secret = process.env.GEMINI_SPARK_MCP_SECRET;
  if (secret && secret.length >= 16 && token.length === secret.length) {
    try {
      if (timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"))) return true;
    } catch {
      /* تُواصل فحص رمز OAuth */
    }
  }

  /* الممر 2: رمز وصول OAuth 2.0 صادر عن نقطة /token */
  const payload = await verifyOAuthToken(token, "at");
  return Boolean(payload);
}

/* ============================ أدوات JSON-RPC ============================ */

function rpcResult(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function rpcError(id: unknown, code: number, message: string, status = 200, data?: unknown) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }),
    { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
  );
}

function toolResult(id: unknown, payload: unknown, isError = false) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError,
  });
}

/* ============================ المعالجة ============================ */

async function handleMessage(
  msg: Record<string, unknown>,
  clientIp: string,
): Promise<Response | null> {
  const id = msg.id ?? null;
  const method = typeof msg.method === "string" ? msg.method : "";

  /* الإشعارات (بلا id) لا تُجاب — لكل إشعار 202 فارغ */
  if (msg.id === undefined) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  switch (method) {
    case "initialize": {
      const params = (msg.params ?? {}) as { protocolVersion?: string; clientInfo?: unknown };
      /* تفاوض الإصدار: نُجيب بإصدار العميل إن أرسله وإلا فبإصدارنا المعتمد */
      const version =
        typeof params.protocolVersion === "string" ? params.protocolVersion : MCP_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
          title: "خادم الإدارة السيادية — كلام له لازمة",
        },
        instructions:
          `هذا الخادم يمنح ${MCP_TOOLS.length} أداة سيادية تغطي كل ذرة في منصة «كلام له لازمة» بلا استثناء — لا قراءة ولا تعديل خارج نطاق الأدوات: إدارة المقالات والأقسام (إنشاء وتعديل وحذف) والأغلفة والتوليد الصوتي، رقابة التعليقات وبلاغاتها وتمييز الملهم منها وتحريره، إدارة القراء (حظر/فك حظر/منح وخصم رصيد الأثر/تصفير الهوية/فحص وإبطال دخولاتهم)، دفتر الأثر الفكري نقطة بنقطة، ذرات التفاعل الخام (تصويتات ومشاركات ومحفوظات) مع إزالة أي سجل، بيانات القراءة الخام مع حق النسيان، حصص نقاش الذكاء الاصطناعي وتصفيرها، قناة مقترحات أهل الكلمة، رسائل اتصل بنا، الصفحات القانونية، البث الجماهيري وجرس الإشعارات الداخلي واشتراكات الإشعارات الفورية، سجل تحديثات المنصة، أخطاء المنصة المبلّغ عنها، إعدادات الحوكمة وقائمة الفحص الأخلاقي، مركز الأمن (التنبيهات ومحاولات الاختراق وقواعد IP وسجل التدقيق)، وحساب الإدارة نفسه (جلساته وأجهزته الموثوقة وكلمة مروره بالتحقق الحالي)، إضافة إلى مركز السيطرة السيادي: مرصد النظام الحي (get_system_telemetry وget_traffic_log وget_server_errors وget_api_quotas)، التكوين السيادي لحظي التطبيق (get_site_config وset_site_config)، والتيرمينال السيادي الكامل (admin_cli) بكل أوامره: sys info وcache purge وuser inspect وuser ban/unban وconfig set وdb stats وtraffic/errors tail، مع التقليم الدوري (run_maintenance: publish_scheduled وprune_logs) والنبض الحي وإعادة توليد كاش الموقع فورًا. كل الأفعال تُوثّق في سجل التدقيق.`,
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: MCP_TOOLS });

    case "tools/call": {
      const params = (msg.params ?? {}) as { name?: string; arguments?: McpArgs };
      const name = params.name ?? "";
      const args = params.arguments ?? {};

      if (!name) {
        return rpcError(id, -32602, "معاملات tools/call تتطلب name");
      }

      try {
        const payload = await executeMcpTool(name, args, { ip: clientIp });
        return toolResult(id, payload);
      } catch (err) {
        console.error("[MCP] tool error:", name, err);
        if (err instanceof McpToolError) {
          return toolResult(id, { error: err.message, ...(err.details ? { details: err.details } : {}) }, true);
        }
        return toolResult(
          id,
          { error: "تعذر تنفيذ العملية — خطأ داخلي في الخادم السيادي" },
          true,
        );
      }
    }

    default:
      return rpcError(id, -32601, `الطريقة غير معروفة: ${method}`);
  }
}

/* ============================ المسارات ============================ */

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "GET غير مدعوم — أرسل رسائل JSON-RPC عبر POST" },
    }),
    { status: 405, headers: { ...JSON_HEADERS, ...CORS_HEADERS, Allow: "POST, OPTIONS" } },
  );
}

export async function POST(request: Request) {
  /* بوابة الأمان أولًا — لا استثناء لأي طلب
     ترويسة WWW-Authenticate مع resource_metadata هي التي تشعل رقصة
     الاكتشاف القياسية عند Gemini: 401 ← اكتشاف ← تسجيل ← تفويض ← توكن */
  if (!(await authorized(request))) {
    const origin = getOrigin(request);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message:
            "غير مصرح — مرّر Authorization: Bearer إما بسرّ المنصة أو برمز وصول OAuth صادر من /api/mcp/oauth/token",
        },
      }),
      {
        status: 401,
        headers: {
          ...JSON_HEADERS,
          ...CORS_HEADERS,
          "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "JSON غير صالح", 400);
  }

  /* دعم الدفعات (Batch) وفق JSON-RPC 2.0 — الإشعارات لا تولّد استجابة */
  if (Array.isArray(body)) {
    const messages = body.filter(
      (m) => typeof m === "object" && m !== null && "id" in (m as Record<string, unknown>),
    ) as Record<string, unknown>[];
    if (messages.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    const payload = await Promise.all(
      messages.map((m) => handleMessage(m, getClientIp(request)).then((r) => r!.json())),
    );
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...JSON_HEADERS, ...CORS_HEADERS },
    });
  }

  if (typeof body !== "object" || body === null) {
    return rpcError(null, -32600, "طلب غير صالح", 400);
  }

  return (
    (await handleMessage(body as Record<string, unknown>, getClientIp(request))) ??
    new Response(null, { status: 202 })
  );
}
