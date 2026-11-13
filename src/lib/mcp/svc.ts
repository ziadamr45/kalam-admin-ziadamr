/**
 * أدوات الخدمات السيادية — Cloudinary + Resend + إشعارات الإدارة (v4.0.0)
 * Cloudinary: رفع ورمي أسير وإعادة تسمية وتنظيم عبر REST الموقّع SHA1.
 * Resend: إرسال بريد مخصص وإدارة النطاقات.
 * Push: إشعار إداري مخصص لأجهزة صاحب المنصة.
 * كل عملية مغيّرة تُوثَّق في سجل التدقيق.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/guard";
import { pushAdmins } from "@/lib/push";
import { resolveEmailConfig } from "@/lib/notifications/dispatcher";
import {
  McpToolError,
  str,
  type McpArgs,
  type McpRequestMeta,
} from "@/lib/mcp/base";

/* ============================ Cloudinary ============================ */

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
  /* الطابع الزمني معلمة إلزامية للتوقيع — تُوقَّع مع البقية وتُرسل معها */
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
  const file = str(args, "file");
  if (!file) {
    throw new McpToolError("file إلزامي — إما رابط مباشر https:// أو بيانات data:image/png;base64,...");
  }
  const resource = str(args, "resource") ?? "image";
  const endpointMap: Record<string, string> = { image: "image/upload", raw: "raw/upload", video: "video/upload" };
  const endpoint = endpointMap[resource];
  if (!endpoint) throw new McpToolError("resource يقبل image | raw | video فقط");

  const params: Record<string, string> = {};
  const publicId = str(args, "public_id");
  const folder = str(args, "folder");
  if (publicId) params.public_id = publicId;
  if (folder) params.folder = folder;
  if (args.invalidate === true) params.invalidate = "true";

  const data = await cldForm(endpoint, params, { name: "file", value: file });
  await writeAudit({
    adminId: null,
    action: "mcp.cloudinary_upload",
    entity: "Cloudinary",
    entityId: String(data.public_id ?? "?"),
    meta: { via: "gemini-spark-mcp", resource, folder: folder ?? null, bytes: Number(data.bytes ?? 0) },
    ip: meta.ip,
  });
  const rawUrl = String(data.secure_url ?? "");
  return {
    uploaded: true,
    public_id: data.public_id,
    secure_url: rawUrl,
    /* رابط تسليم محسّن تلقائيًا للصور — WebP/AVIF حسب المتصفح */
    delivery_url: resource === "image" && rawUrl ? rawUrl.replace("/upload/", "/upload/f_auto,q_auto/") : rawUrl,
    bytes: Number(data.bytes ?? 0),
    format: data.format ?? null,
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

/* ============================ Resend ============================ */

async function resendSend(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const to = str(args, "to");
  const subject = str(args, "subject");
  if (!to || !subject) throw new McpToolError("to وsubject إلزاميان");
  const html = str(args, "html");
  const text = str(args, "text");
  if (!html && !text) throw new McpToolError("مرر متن الرسالة في html أو text");
  const { key, from } = await resolveEmailConfig();
  if (!key) throw new McpToolError("مفتاح Resend غير مضبوط — أضفه من إعدادات Vercel أو التكوين السيادي");

  const body: Record<string, unknown> = {
    from: str(args, "from") ?? from,
    to: to.split(",").map((x) => x.trim()).filter(Boolean),
    subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  const replyTo = str(args, "reply_to");
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    throw new McpToolError(`Resend رفض الإرسال (${res.status}): ${data.message ?? data.name ?? "خطأ غير معروف"}`, data);
  }
  await writeAudit({
    adminId: null,
    action: "mcp.resend_send_email",
    entity: "Email",
    entityId: data.id ?? null,
    meta: { via: "gemini-spark-mcp", to: body.to, subject, from: body.from },
    ip: meta.ip,
  });
  return { sent: true, email_id: data.id ?? null, from: body.from, to: body.to, subject };
}

async function resendManage(args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  const { key } = await resolveEmailConfig();
  if (!key) throw new McpToolError("مفتاح Resend غير مضبوط");
  const action = str(args, "action") ?? "list";

  /* مساعد: جلب معرف النطاق من domain_id أو اسم النطاق مباشرة */
  const resolveDomainId = async (): Promise<{ id: string; name?: string }> => {
    const id = str(args, "domain_id");
    if (id) return { id };
    const name = str(args, "domain");
    if (!name) throw new McpToolError("مرر domain_id أو domain (اسم النطاق مثل ziadamr.me)");
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { data?: { id: string; name: string }[] };
    const hit = data.data?.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (!hit) throw new McpToolError(`لا يوجد نطاق باسم «${name}» في حساب Resend — استخدم action=list للجرد`);
    return { id: hit.id, name: hit.name };
  };

  if (action === "list") {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { id: string; name: string; status: string; created_at: string; region: string }[];
      message?: string;
    };
    if (!res.ok) {
      throw new McpToolError(`Resend رفض عرض النطاقات (${res.status}): ${data.message ?? "قد يكون المفتاح بلا صلاحية إدارة نطاقات"}`, data);
    }
    return {
      count: data.data?.length ?? 0,
      domains: data.data ?? [],
    };
  }

  if (action === "get") {
    const { id } = await resolveDomainId();
    const res = await fetch(`https://api.resend.com/domains/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new McpToolError(`Resend رفض الطلب (${res.status})`, data);
    return data;
  }

  /* التحقق: إطلاق فحص سجلات DNS للنطاق بعد ضبطها لدى مزود النطاق */
  if (action === "verify") {
    const { id, name } = await resolveDomainId();
    const res = await fetch(`https://api.resend.com/domains/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new McpToolError(`Resend رفض التحقق (${res.status}): ${JSON.stringify(data).slice(0, 200)}`, data);
    }
    await writeAudit({
      adminId: null,
      action: "mcp.resend_domain_verify",
      entity: "ResendDomain",
      entityId: name ?? id,
      meta: { via: "gemini-spark-mcp", domainId: id },
      ip: meta.ip,
    });
    return { verifying: true, domain: name ?? null, domainId: id, result: data };
  }

  /* إضافة نطاق جديد — الرد يشمل سجلات DNS المطلوبة لضبطها عند مزود النطاق */
  if (action === "create") {
    const name = str(args, "domain");
    if (!name) throw new McpToolError("domain (اسم النطاق) إلزامي مع action=create");
    const region = str(args, "region");
    const res = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...(region ? { region } : {}) }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new McpToolError(`Resend رفض إنشاء النطاق (${res.status}): ${JSON.stringify(data).slice(0, 200)}`, data);
    }
    await writeAudit({
      adminId: null,
      action: "mcp.resend_domain_created",
      entity: "ResendDomain",
      entityId: name,
      meta: { via: "gemini-spark-mcp", region: region ?? null },
      ip: meta.ip,
    });
    return { created: true, domain: name, ...(data as Record<string, unknown>) };
  }

  if (action === "delete") {
    const { id, name } = await resolveDomainId();
    const res = await fetch(`https://api.resend.com/domains/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new McpToolError(`Resend رفض حذف النطاق (${res.status}): ${JSON.stringify(data).slice(0, 200)}`, data);
    }
    await writeAudit({
      adminId: null,
      action: "mcp.resend_domain_deleted",
      entity: "ResendDomain",
      entityId: name ?? id,
      meta: { via: "gemini-spark-mcp", domainId: id },
      ip: meta.ip,
    });
    return { deleted: true, domain: name ?? null, domainId: id };
  }

  /* حالة تسليم بريد بعينه: وصل delivered أم ارتد bounced أم لسه معلق —
     بمعرف الرسالة الذي يعيده resend_send_email (GET /emails/{id} الرسمي) */
  if (action === "email_status") {
    const emailId = str(args, "email_id");
    if (!emailId) throw new McpToolError("email_id إلزامي — معرف الرسالة من استجابة resend_send_email");
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new McpToolError(
        `Resend رفض فحص حالة الرسالة (${res.status}): ${String(data.message ?? "غير معروف")}${res.status === 404 ? " — تأكد من معرف الرسالة email_id" : ""}`,
        data,
      );
    }
    const lastEvent = String(data.last_event ?? data.status ?? "unknown");
    const human: Record<string, string> = {
      queued: "معلقة في الطابور — لم تُرسل بعد",
      sent: "سُلمت لمزود البريد — لم يُؤكد الوصول للصندوق بعد",
      delivered: "وصلت صندوق المستلم بنجاح",
      bounced: "ارتدت — العنوان غير موجود أو رفض المستلم التسليم",
      complained: "علّمها المستلم رسالة مزعجة",
    };
    return {
      emailId,
      status: lastEvent,
      delivered: lastEvent === "delivered",
      bounced: lastEvent === "bounced",
      pending: lastEvent === "queued" || lastEvent === "sent",
      meaning: human[lastEvent] ?? "حالة غير معروفة — راجع القيمة الخام",
      to: data.to ?? null,
      subject: data.subject ?? null,
      createdAt: data.created_at ?? null,
    };
  }

  throw new McpToolError("action يقبل list | get | verify | create | delete | email_status فقط");
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
    case "resend_manage": return resendManage(args, meta);
    case "kalam_push_admin_custom": return pushAdminCustom(args, meta);
    default: throw new McpToolError(`أداة الخدمات غير معروفة: «${name}»`);
  }
}
