import {
  mintClientId,
  oauthErrorResponse,
  OAUTH_CORS,
  OAUTH_SCOPE,
  validRedirectUri,
} from "@/lib/mcp/oauth";

/**
 * التسجيل الديناميكي للعملاء (RFC 7591) — Gemini يسجّل نفسه هنا تلقائيًا
 * عند إضافة الخادم كتطبيق متصل، فيحصل على client_id موقّع ذاتيًا يحمل
 * بياناته داخله (بلا أي تخزين) ثم يسير بتدفق رمز التفويض + PKCE.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthErrorResponse("invalid_client_metadata", "جسم الطلب ليس JSON صالحًا");
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every(validRedirectUri)
  ) {
    return oauthErrorResponse(
      "invalid_redirect_uri",
      "يلزم redirect_uris صالحة — https إلزامي (يُسمح بـ http://localhost للتطوير)",
    );
  }

  const grantTypes = Array.isArray(body.grant_types)
    ? (body.grant_types as string[]).filter((g) =>
        ["authorization_code", "refresh_token"].includes(g),
      )
    : [];
  const responseTypes = Array.isArray(body.response_types)
    ? (body.response_types as string[]).filter((t) => t === "code")
    : [];

  const client = {
    name:
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.trim().slice(0, 80)
        : "تطبيق MCP خارجي",
    redirectUris: redirectUris as string[],
    iat: Math.floor(Date.now() / 1000),
  };

  return new Response(
    JSON.stringify({
      client_id: mintClientId(client),
      client_id_issued_at: client.iat,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: grantTypes.length ? grantTypes : ["authorization_code", "refresh_token"],
      response_types: responseTypes.length ? responseTypes : ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE,
    }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...OAUTH_CORS,
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
