import { timingSafeEqual } from "crypto";
import {
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/schemas";
import { executeMcpTool, McpToolError, type McpArgs } from "@/lib/mcp/executors";
import { getClientIp } from "@/lib/guard";

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
 * الأمان: لا يُقبل أي طلب دون ترويسة
 *   Authorization: Bearer <GEMINI_SPARK_MCP_SECRET>
 * بمقارنة زمنية ثابتة تمنع هجمات قياس التوقيت. الخادم عديم الحالة (Stateless)
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

function authorized(request: Request): boolean {
  const secret = process.env.GEMINI_SPARK_MCP_SECRET;
  if (!secret || secret.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token || token.length !== secret.length) return false;

  /* مقارنة زمنية ثابتة — لا تسرّب طول أو موضع الاختلاف */
  try {
    return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    return false;
  }
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
          "هذا الخادم يمنح أدوات إدارية سيادية كاملة على منصة «كلام له لازمة»: إدارة المقالات والأقسام، إطلاق التوليد الصوتي، تحديث الأغلفة، التحليلات، مراقبة التعليقات واتخاذ قراراتها، وإعادة توليد كاش الموقع العام فورًا. كل الأفعال تُوثّق في سجل التدقيق.",
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
  /* بوابة الأمان أولًا — لا استثناء لأي طلب */
  if (!authorized(request)) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message: "غير مصرح — يلزم ترويسة Authorization: Bearer <GEMINI_SPARK_MCP_SECRET>",
        },
      }),
      { status: 401, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
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
