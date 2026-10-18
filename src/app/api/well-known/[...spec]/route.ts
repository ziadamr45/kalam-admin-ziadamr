import {
  authorizationServerMetadata,
  getOrigin,
  protectedResourceMetadata,
  OAUTH_CORS,
} from "@/lib/mcp/oauth";

/**
 * اكتشاف OAuth القياسي — البوابة التي يبدأ منها Gemini ربط MCP:
 *   /.well-known/oauth-protected-resource            (RFC 9728 — بيانات المورد المحمي)
 *   /.well-known/oauth-protected-resource/api/mcp    (النمط المُدرج في المسار)
 *   /.well-known/oauth-authorization-server          (RFC 8414 — بيانات خادم التفويض)
 *   /.well-known/openid-configuration                (اسم بديل يطلبه بعض العملاء)
 * تُعاد كتابتها من next.config.mjs إلى هذا المسار الجامع.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ spec: string[] }> },
) {
  const { spec } = await ctx.params;
  const origin = getOrigin(request);
  const path = (spec ?? []).join("/");

  let body: unknown = null;
  if (
    path === "oauth-protected-resource" ||
    path === "oauth-protected-resource/api/mcp"
  ) {
    body = protectedResourceMetadata(origin);
  } else if (
    path === "oauth-authorization-server" ||
    path === "oauth-authorization-server/api/mcp" ||
    path === "openid-configuration"
  ) {
    body = authorizationServerMetadata(origin);
  }

  if (!body) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...OAUTH_CORS,
    },
  });
}
