/**
 * أدوات الخدمات السيادية — Cloudinary + Gmail SMTP + إشعارات الإدارة (v4.1.0)
 * Cloudinary: رفع مباشر (رابط https / base64 / كود SVG خام يُرسم تلقائيًا لـ PNG عالي الدقة عبر Resvg) + إعادة تسمية وتنظيم عبر REST الموقّع SHA1.
 * Email: إرسال بريد مخصص عبر Gmail SMTP (Nodemailer).
 * Push: إشعار إداري مخصص لأجهزة صاحب المنصة.
 * كل عملية مغيّرة تُوثَّق في سجل التدقيق.
 */

import { inlineUploadSizeIssue } from "@/lib/mcp/inline-upload-limits";
import { createHash } from "crypto";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/guard";
import { pushAdmins } from "@/lib/push";
import { resolveEmailConfig, sendRawEmail } from "@/lib/notifications/dispatcher";
import {
  McpToolError,
  bool,
  num,
  str,
  type McpArgs,
  type McpRequestMeta,
} from "@/lib/mcp/base";

/* ============================ Cloudinary ============================ */

const BUNDLED_FONT_FILES = [
  "Amiri-Regular.ttf",
  "Amiri-Bold.ttf",
  "Tajawal-Regular.ttf",
  "Tajawal-Bold.ttf",
];

function extractSvgInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^<svg[\s>]/i.test(trimmed) || (trimmed.startsWith("<?xml") && /<svg[\s>]/i.test(trimmed))) {
    return trimmed;
  }
  if (/^data:image\/svg\+xml/i.test(trimmed)) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) {
      throw new McpToolError("بيانات data:image/svg+xml غير صالحة");
    }
    const header = trimmed.slice(0, commaIdx).toLowerCase();
    const payload = trimmed.slice(commaIdx + 1);
    const decoded = header.includes(";base64")
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload);
    if (!/<svg[\s>]/i.test(decoded)) {
      throw new McpToolError("محتوى SVG المفكوك لا يحتوي على وسم <svg>");
    }
    return decoded.trim();
  }
  return null;
}

function renderSvgToPng(
  svgSource: string,
  opts: { width?: number; scale?: number; background?: string }
): { dataUri: string; width: number; height: number; pngBytes: number } {
  if (svgSource.length > 512 * 1024) {
    throw new McpToolError("حجم كود SVG يتجاوز الحد المسموح (512 كيلوبايت)");
  }
  if (!/<svg[\s>]/i.test(svgSource) || !/<\/svg>/i.test(svgSource)) {
    throw new McpToolError("كود SVG غير مكتمل — تأكد من وجود وسم البداية <svg> والنهاية </svg>");
  }

  let fitTo: { mode: "original" } | { mode: "width"; value: number } | { mode: "zoom"; value: number } = {
    mode: "original",
  };
  if (opts.width !== undefined) {
    const clampedWidth = Math.min(4096, Math.max(16, Math.round(opts.width)));
    fitTo = { mode: "width", value: clampedWidth };
  } else if (opts.scale !== undefined) {
    const clampedScale = Math.min(4, Math.max(0.5, opts.scale));
    fitTo = { mode: "zoom", value: clampedScale };
  }

  const fontFiles = BUNDLED_FONT_FILES.map((f) => path.join(process.cwd(), "src/assets/fonts", f));

  try {
    const resvg = new Resvg(svgSource, {
      ...(opts.background ? { background: opts.background } : {}),
      fitTo,
      font: {
        fontFiles,
        loadSystemFonts: false,
        defaultFontFamily: "Amiri",
      },
    });
    const rendered = resvg.render();
    const pngBuffer = Buffer.from(rendered.asPng());
    return {
      dataUri: `data:image/png;base64,${pngBuffer.toString("base64")}`,
      width: rendered.width,
      height: rendered.height,
      pngBytes: pngBuffer.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new McpToolError(`تعذّر رسم SVG إلى PNG: ${msg}`);
  }
}

function cloudinaryCreds(): { cloud: string; key: string; secret: string } {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret || cloud.startsWith("PLACEHOLDER")) {
    throw new McpToolError("مفاتيح Cloudinary غير مضبوطة على الخادم — أضفها من إعدادات Vercel");
  }
  return { cloud, key, secret };
}

/** توقيع المعاملات بترتيب أبجدي + sha1(النص + السر) — معيار Cloudinary */
function cldSignature(params: Record<string, string>, secret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${secret}`).digest("hex");
}

async function cldForm(endpoint: string, params: Record<string, string>, fileField?: { name: string; value: string }) {
  const { cloud, key, secret } = cloudinaryCreds();
  const signed = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = cldSignature(signed, secret);
  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.append(k, v);
  form.append("api_key", key);
  form.append("signature", signature);
  if (fileField) form.append(fileField.name, fileField.value);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${endpoint}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data?.error === "object" && data.error !== null
      ? String((data.error as { message?: string }).message ?? res.status)
      : `HTTP ${res.status}`;
    throw new McpToolError(`Cloudinary رفض الطلب: ${msg}`, data);
  }
  return data;
}

async function cloudinaryUpload(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const rawFile = str(args, "file");
  const rawSvgArg = str(args, "svg");
  const input = rawSvgArg ?? rawFile;
  if (!input) {
    throw new McpToolError("file أو svg إلزامي — رابط مباشر https:// أو data:image/... أو كود <svg> خام");
  }
  const resource = str(args, "resource") ?? "image";
  const endpointMap: Record<string, string> = { image: "image/upload", raw: "raw/upload", video: "video/upload" };
  const endpoint = endpointMap[resource];
  if (!endpoint) throw new McpToolError("resource يقبل image | raw | video فقط");

  const sizeIssue = inlineUploadSizeIssue(input, args);
  if (sizeIssue) throw new McpToolError(sizeIssue);

  const svgSource = extractSvgInput(input);
  const shouldRasterize = Boolean(svgSource) && resource === "image" && bool(args, "rasterize_svg") !== false;

  let uploadValue = input;
  let rasterMeta: { width: number; height: number; pngBytes: number } | null = null;
  if (shouldRasterize && svgSource) {
    const rendered = renderSvgToPng(svgSource, {
      width: num(args, "width"),
      scale: num(args, "scale"),
      background: str(args, "background"),
    });
    uploadValue = rendered.dataUri;
    rasterMeta = { width: rendered.width, height: rendered.height, pngBytes: rendered.pngBytes };
  } else if (svgSource && !input.trim().toLowerCase().startsWith("data:")) {
    uploadValue = `data:image/svg+xml;base64,${Buffer.from(svgSource, "utf8").toString("base64")}`;
  }

  const params: Record<string, string> = {};
  const publicId = str(args, "public_id");
  const folder = str(args, "folder");
  if (publicId) params.public_id = publicId;
  if (folder) params.folder = folder;
  if (args.invalidate === true) params.invalidate = "true";

  const data = await cldForm(endpoint, params, { name: "file", value: uploadValue });
  await writeAudit({
    adminId: null,
    action: "mcp.cloudinary_upload",
    entity: "Cloudinary",
    entityId: String(data.public_id ?? "?"),
    meta: {
      via: "gemini-spark-mcp",
      resource,
      folder: folder ?? null,
      bytes: Number(data.bytes ?? 0),
      rasterizedFromSvg: Boolean(rasterMeta),
      ...(rasterMeta ? { width: rasterMeta.width, height: rasterMeta.height } : {}),
    },
    ip: meta.ip,
  });
  const rawUrl = String(data.secure_url ?? "");
  return {
    uploaded: true,
    public_id: data.public_id,
    secure_url: rawUrl,
    delivery_url: resource === "image" && rawUrl ? rawUrl.replace("/upload/", "/upload/f_auto,q_auto/") : rawUrl,
    bytes: Number(data.bytes ?? 0),
    format: data.format ?? null,
    ...(rasterMeta ? { rasterized_from_svg: true, rendered_width: rasterMeta.width, rendered_height: rasterMeta.height } : {}),
  };
}

async function cloudinaryRename(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const fromId = str(args, "from_public_id");
  const toId = str(args, "to_public_id");
  if (!fromId || !toId) throw new McpToolError("from_public_id وto_public_id إلزاميان");
  const resource = str(args, "resource") ?? "image";
  const endpointMap: Record<string, string> = { image: "image/rename", raw: "raw/rename", video: "video/rename" };
  const params: Record<string, string> = { from_public_id: fromId, to_public_id: toId };
  if (args.invalidate === true) params.invalidate = "true";
  const data = await cldForm(endpointMap[resource], params);
  await writeAudit({
    adminId: null,
    action: "mcp.cloudinary_rename",
    entity: "Cloudinary",
    entityId: fromId,
    meta: { via: "gemini-spark-mcp", to: toId, resource },
    ip: meta.ip,
  });
  return { renamed: true, from: fromId, to: toId, public_id: data.public_id ?? toId };
}

/* ============================ البريد (Gmail SMTP) ============================ */

async function resendSend(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const to = str(args, "to");
  const subject = str(args, "subject");
  if (!to || !subject) throw new McpToolError("to وsubject إلزاميان");
  const html = str(args, "html");
  const text = str(args, "text");
  if (!html && !text) throw new McpToolError("مرر متن الرسالة في html أو text");
  const { user, pass, from } = await resolveEmailConfig();
  if (!user || !pass) {
    throw new McpToolError("قناة البريد (Gmail SMTP) غير مضبوطة — أضف SMTP_PASS من صفحة إعدادات الموقع");
  }

  const recipients = to.split(",").map((x) => x.trim()).filter(Boolean);
  const actualFrom = str(args, "from") ?? from;
  const replyTo = str(args, "reply_to");

  const sent = await sendRawEmail({
    from: actualFrom,
    to: recipients,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });

  if (!sent.ok) {
    throw new McpToolError(`فشل إرسال البريد عبر Gmail SMTP: ${sent.error ?? "خطأ غير معروف"}`);
  }
  await writeAudit({
    adminId: null,
    action: "mcp.smtp_send_email",
    entity: "Email",
    entityId: sent.messageId ?? null,
    meta: { via: "gemini-spark-mcp", to: recipients, subject, from: actualFrom },
    ip: meta.ip,
  });
  return { sent: true, email_id: sent.messageId ?? null, from: actualFrom, to: recipients, subject };
}

async function resendManage(): Promise<unknown> {
  const cfg = await resolveEmailConfig();
  return {
    provider: "Gmail SMTP (Nodemailer)",
    active: Boolean(cfg.user && cfg.pass),
    from: cfg.from,
    note: "تم الاستغناء عن Resend وإزالته نهائيًا؛ البريد يعمل مباشرة عبر Gmail SMTP بدون الحاجة لنطاق مخصص.",
  };
}

/* ============================ إشعارات الإدارة ============================ */

async function pushAdminCustom(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const title = str(args, "title");
  const body = str(args, "body");
  if (!title || !body) throw new McpToolError("title وbody إلزاميان");
  const url = str(args, "url") ?? "/";
  const subs = await prisma.adminPushSubscription.count();
  if (subs === 0) {
    return { sent: false, note: "لا توجد أجهزة إدارة مشتركة — فعّل الإشعارات من ترويسة اللوحة أولًا" };
  }
  await pushAdmins({ title, body: body.slice(0, 300), url, tag: str(args, "tag") ?? "mcp-custom" });
  await writeAudit({
    adminId: null,
    action: "mcp.push_admin_custom",
    meta: { via: "gemini-spark-mcp", title, url, subscriptions: subs },
    ip: meta.ip,
  });
  return { sent: true, subscriptions: subs, title, url };
}

/* ============================ الموزّع ============================ */

export async function executeSvcTool(name: string, args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  switch (name) {
    case "cloudinary_upload_file": return cloudinaryUpload(args, meta);
    case "cloudinary_rename_asset": return cloudinaryRename(args, meta);
    case "resend_send_email": return resendSend(args, meta);
    case "resend_manage": return resendManage();
    case "kalam_push_admin_custom": return pushAdminCustom(args, meta);
    default: throw new McpToolError(`أداة الخدمات غير معروفة: «${name}»`);
  }
}
