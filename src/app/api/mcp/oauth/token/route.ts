import {
  ACCESS_TOKEN_TTL_SEC,
  getOrigin,
  oauthErrorResponse,
  parseTokenRequestBody,
  pkceOk,
  REFRESH_TOKEN_TTL_SEC,
  signOAuthToken,
  verifyClientId,
  verifyOAuthToken,
  OAUTH_CORS,
} from "@/lib/mcp/oauth";

/**
 * نقطة تبديل الرموز (RFC 6749 §3.2) — تدفّقان:
 *   authorization_code : رمز التفويض + code_verifier (PKCE S256/plain) → رمز وصول + رمز تحديث
 *   refresh_token      : رمز تحديث صالح → رمز وصول جديد مع تدوير رمز التحديث
 * كل الرموز JWT موقعة HS256 بسرّ المنصة — عديمة الحالة بنيويًا.
 */
export async function POST(request: Request) {
  const origin = getOrigin(request);
  const form = await parseTokenRequestBody(request);
  const grantType = form.get("grant_type") ?? "";
  const clientId = form.get("client_id") ?? "";

  if (!grantType) {
    return oauthErrorResponse("invalid_request", "معامل grant_type مطلوب");
  }

  /* العميل العام — client_id موقّع ذاتيًا إلزامي */
  const client = verifyClientId(clientId);
  if (!client) {
    return oauthErrorResponse("invalid_client", "client_id غير صالح أو غير موقّع", 401);
  }

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const verifier = form.get("code_verifier") ?? "";

    if (!code || !redirectUri || !verifier) {
      return oauthErrorResponse(
        "invalid_request",
        "يلزم معاملات code و redirect_uri و code_verifier",
      );
    }

    const payload = await verifyOAuthToken(code, "code");
    if (!payload) {
      return oauthErrorResponse("invalid_grant", "رمز التفويض غير صالح أو منتهي");
    }
    if (payload.client_id !== clientId) {
      return oauthErrorResponse("invalid_grant", "رمز التفويض لا يخص هذا العميل");
    }
    if (payload.redirect_uri !== redirectUri) {
      return oauthErrorResponse("invalid_grant", "redirect_uri لا يطابق طلب التفويض");
    }
    if (!pkceOk(verifier, String(payload.challenge ?? ""), String(payload.method ?? "S256"))) {
      return oauthErrorResponse("invalid_grant", "فشل التحقق من PKCE — code_verifier لا يطابق التحدي");
    }

    const scope = typeof payload.scope === "string" ? payload.scope : "mcp:admin";
    const resource = typeof payload.resource === "string" ? payload.resource : undefined;
    const accessToken = await signOAuthToken(
      {
        iss: origin,
        sub: "gemini-spark",
        client_id: clientId,
        scope,
        ...(resource ? { aud: resource } : {}),
      },
      "at",
      ACCESS_TOKEN_TTL_SEC,
    );
    const refreshToken = await signOAuthToken(
      { iss: origin, client_id: clientId, scope },
      "rt",
      REFRESH_TOKEN_TTL_SEC,
    );

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: refreshToken,
        scope,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          ...OAUTH_CORS,
        },
      },
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? "";
    if (!refreshToken) {
      return oauthErrorResponse("invalid_request", "معامل refresh_token مطلوب");
    }
    const payload = await verifyOAuthToken(refreshToken, "rt");
    if (!payload || payload.client_id !== clientId) {
      return oauthErrorResponse("invalid_grant", "رمز التحديث غير صالح أو لا يخص هذا العميل");
    }

    const scope = typeof form.get("scope") === "string" && form.get("scope")
      ? String(form.get("scope"))
      : typeof payload.scope === "string"
        ? payload.scope
        : "mcp:admin";

    const accessToken = await signOAuthToken(
      { iss: origin, sub: "gemini-spark", client_id: clientId, scope },
      "at",
      ACCESS_TOKEN_TTL_SEC,
    );
    /* تدوير رمز التحديث — رمز جديد مع كل استخدام */
    const rotatedRefresh = await signOAuthToken(
      { iss: origin, client_id: clientId, scope },
      "rt",
      REFRESH_TOKEN_TTL_SEC,
    );

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: rotatedRefresh,
        scope,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          ...OAUTH_CORS,
        },
      },
    );
  }

  return oauthErrorResponse("unsupported_grant_type", `نوع التدفق غير مدعوم: ${grantType}`);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
