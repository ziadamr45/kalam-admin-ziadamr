/**
 * أدوات البنية التحتية السيادية — Vercel (v4.0.0)
 * تحكم كامل في النشر: قراءة النشرات وسجلاتها، إعادة النشر، التراجع،
 * متغيرات البيئة (قراءة/إضافة/تعديل/حذف)، الدومينات، إعدادات المشروع،
 * والمهام المجدولة من vercel.json — عبر Vercel REST API بتوكن VERCEL_API_TOKEN.
 * كل عملية مغيّرة تُوثَّق في سجل التدقيق.
 */

import { writeAudit } from "@/lib/guard";
import {
  McpToolError,
  str,
  num,
  type McpArgs,
  type McpRequestMeta,
} from "@/lib/mcp/base";

const PROJECTS: Record<string, string> = {
  public: "prj_aBhWLJ1LvqmhULGsXQu4tqBnjrld",
  admin: "prj_5Nj0SL34olkbPeiaECAuwAjW8jPE",
};

function vcToken(): string {
  const token = process.env.VERCEL_API_TOKEN ?? process.env.VERCEL_TOKEN;
  if (!token || token.length < 20) {
    throw new McpToolError(
      "متغير البيئة VERCEL_API_TOKEN غير مضبوط على الخادم — أضفه من إعدادات Vercel (توكن حساب Vercel) وأعد النشر",
    );
  }
  return token;
}

function resolveProject(project?: string): string {
  const key = (project ?? "public").toLowerCase();
  const id = PROJECTS[key];
  if (!id) {
    throw new McpToolError(`مشروع غير معروف: «${project}» — المقبول: public الموقع العام | admin لوحة الأدمن`);
  }
  return id;
}

async function vcApi(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${vcToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in (data as Record<string, unknown>)
        ? String((data as { error: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
        : `HTTP ${res.status}`;
    throw new McpToolError(`Vercel رفض الطلب (${res.status}): ${msg}`, data ?? undefined);
  }
  return { status: res.status, data };
}

/* ============================ النشرات ============================ */

async function vcListDeployments(args: McpArgs) {
  const projectId = resolveProject(str(args, "project"));
  const limit = Math.min(Math.max(num(args, "limit") ?? 10, 1), 30);
  const target = str(args, "target");
  const qs = new URLSearchParams({ projectId, limit: String(limit) });
  if (target) qs.set("target", target);
  const { data } = await vcApi("GET", `/v6/deployments?${qs}`);
  const d = data as {
    deployments: {
      uid: string; url: string; state: string; readyState: string; target: string | null;
      created_at: number; meta: Record<string, string>; inspectorUrl: string | null;
    }[];
  };
  return {
    count: d.deployments.length,
    deployments: d.deployments.map((x) => ({
      uid: x.uid,
      url: x.url,
      state: x.readyState,
      target: x.target,
      created: new Date(x.created ?? x.created_at ?? Date.now()).toISOString(),
      sha: (x.meta?.githubCommitSha ?? x.meta?.gitlabCommitSha ?? "").slice(0, 10) || null,
      commitMsg: (x.meta?.githubCommitMessage ?? x.meta?.gitlabCommitMessage ?? "").split("\n")[0] || null,
      inspector: x.inspectorUrl,
    })),
  };
}

async function vcGetDeployment(args: McpArgs) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف النشرة id أو رابطها إلزامي");
  const { data } = await vcApi("GET", `/v13/deployments/${encodeURIComponent(id)}`);
  const d = data as {
    uid: string; url: string; readyState: string; target: string | null; createdAt: number;
    projectId: { id: string }; meta: Record<string, string>; alias?: string[];
  };
  return {
    uid: d.uid,
    url: d.url,
    state: d.readyState,
    target: d.target,
    created: new Date(d.createdAt).toISOString(),
    sha: (d.meta?.githubCommitSha ?? "").slice(0, 10) || null,
    commitMsg: (d.meta?.githubCommitMessage ?? "").split("\n")[0] || null,
    aliases: d.alias ?? [],
  };
}

async function vcGetDeploymentLogs(args: McpArgs) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف النشرة id إلزامي");
  const limit = Math.min(Math.max(num(args, "limit") ?? 80, 1), 300);
  const { data } = await vcApi("GET", `/v2/deployments/${encodeURIComponent(id)}/events?limit=${limit}&builds=1`);
  const events = Array.isArray(data) ? (data as { type: string; created: number; payload?: { text?: string } }[]) : [];
  const lines = events
    .filter((e) => e.payload?.text)
    .map((e) => ({ at: new Date(e.created).toISOString(), text: String(e.payload?.text).slice(0, 500) }));
  return { count: lines.length, events: lines.slice(-limit) };
}

async function vcRedeploy(args: McpArgs, meta: McpRequestMeta, forcedSha?: string) {
  const projectKey = (str(args, "project") ?? "public").toLowerCase();
  const projectId = resolveProject(projectKey);
  const repo = projectKey === "admin" ? "kalam-admin-ziadamr" : "kalam-ziadamr";
  const ref = forcedSha ?? str(args, "ref") ?? "main";
  const { data } = await vcApi("POST", "/v13/deployments", {
    projectId,
    target: "production",
    gitSource: { type: "git", org: "ziadamr45", repo, ref },
  });
  const d = data as { uid: string; url: string; readyState: string };
  await writeAudit({
    adminId: null,
    action: "mcp.vercel_redeploy",
    entity: "Vercel",
    entityId: projectId,
    meta: { via: "gemini-spark-mcp", project: projectKey, ref, fromRollback: Boolean(forcedSha) },
    ip: meta.ip,
  });
  return { triggered: true, project: projectKey, ref, deployment: { uid: d.uid, url: d.url, state: d.readyState } };
}

async function vcRollback(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف النشرة المستهدفة للتراجع id إلزامي — من vercel_list_deployments");
  /* المحاولة الأولى: التراجع الفوري الرسمي — أسرع وأبقى الاسم المستعار يتحرك فورًا */
  try {
    const { data } = await vcApi("POST", `/v13/deployments/${encodeURIComponent(id)}/rollback`, {});
    const d = data as { uid?: string; url?: string; readyState?: string };
    const projectKey = (str(args, "project") ?? "public").toLowerCase();
    await writeAudit({
      adminId: null,
      action: "mcp.vercel_rollback",
      entity: "Vercel",
      entityId: id,
      meta: { via: "gemini-spark-mcp", project: projectKey, mode: "instant" },
      ip: meta.ip,
    });
    return { rolledBack: true, mode: "instant", target: id, newDeployment: d ?? null };
  } catch {
    /* المحاولة الثانية: إطلاق نشر إنتاج جديد من SHA النسخة المستهدفة */
    const { data } = await vcApi("GET", `/v13/deployments/${encodeURIComponent(id)}`);
    const d = data as { meta?: Record<string, string>; projectId?: { id: string } | string };
    const sha = d.meta?.githubCommitSha;
    if (!sha) throw new McpToolError("لا يمكن التراجع: النسخة المستهدفة بلا SHA جيت هب مرتبط");
    const result = await vcRedeploy({ project: str(args, "project"), ref: sha }, meta, sha);
    return { rolledBack: true, mode: "sha_redeploy", target: id, ...(result as Record<string, unknown>) };
  }
}

/* ============================ متغيرات البيئة ============================ */

async function vcListEnv(args: McpArgs) {
  const projectId = resolveProject(str(args, "project"));
  const reveal = args.reveal === true;
  const { data } = await vcApi("GET", `/v9/projects/${projectId}/env?decrypt=${reveal ? "true" : "false"}`);
  const d = data as { envs: { key: string; target: string[]; type: string; value?: string; createdAt: number; updatedAt: number }[] };
  return {
    count: d.envs.length,
    envs: d.envs
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((e) => ({
        key: e.key,
        target: e.target,
        type: e.type,
        value: reveal ? e.value : "***مخفي — مرر reveal=true لكشفه***",
        updated: new Date(e.updatedAt ?? e.createdAt).toISOString(),
      })),
  };
}

async function vcSetEnv(args: McpArgs, meta: McpRequestMeta) {
  const projectId = resolveProject(str(args, "project"));
  const key = str(args, "key");
  const value = str(args, "value");
  if (!key || value === undefined) throw new McpToolError("key وvalue إلزاميان");
  const targetRaw = str(args, "target") ?? "production";
  const target = targetRaw.split(",").map((t) => t.trim()).filter((t) => ["production", "preview", "development"].includes(t));
  const targets = target.length ? target : ["production", "preview", "development"];
  let created = false;
  try {
    await vcApi("POST", `/v10/projects/${projectId}/env`, {
      key, value, type: "encrypted", target: targets, gitBranch: null,
    });
    created = true;
  } catch (e) {
    const message = e instanceof McpToolError ? e.message : "";
    if (!message.includes("already exists") && !message.includes("ENV_ALREADY")) throw e;
    /* المفتاح قائم — ابحث عنه وعدّل قيمته */
    const { data } = await vcApi("GET", `/v9/projects/${projectId}/env`);
    const envs = (data as { envs: { id: string; key: string }[] }).envs;
    const hit = envs.find((x) => x.key === key);
    if (!hit) throw e;
    await vcApi("PATCH", `/v9/projects/${projectId}/env/${hit.id}`, {
      value, target: targets, type: "encrypted", gitBranch: null,
    });
  }
  await writeAudit({
    adminId: null,
    action: "mcp.vercel_set_env",
    entity: "VercelEnv",
    entityId: `${projectId}:${key}`,
    meta: { via: "gemini-spark-mcp", key, created, target: targets, valueBytes: value.length },
    ip: meta.ip,
  });
  return { saved: true, created, key, target: targets, note: "تغييرات البيئة تتطلب إعادة نشر لتصبح حية" };
}

async function vcDeleteEnv(args: McpArgs, meta: McpRequestMeta) {
  const projectId = resolveProject(str(args, "project"));
  const key = str(args, "key");
  if (!key) throw new McpToolError("key إلزامي — اسم المتغير المراد حذفه");
  const { data } = await vcApi("GET", `/v9/projects/${projectId}/env`);
  const envs = (data as { envs: { id: string; key: string }[] }).envs;
  const hit = envs.find((x) => x.key === key);
  if (!hit) throw new McpToolError(`لا يوجد متغير بالاسم «${key}» على هذا المشروع`);
  await vcApi("DELETE", `/v9/projects/${projectId}/env/${hit.id}`);
  await writeAudit({
    adminId: null,
    action: "mcp.vercel_delete_env",
    entity: "VercelEnv",
    entityId: `${projectId}:${key}`,
    meta: { via: "gemini-spark-mcp", key },
    ip: meta.ip,
  });
  return { deleted: true, key, note: "تغييرات البيئة تتطلب إعادة نشر لتصبح حية" };
}

/* ============================ الدومينات والمشروع ============================ */

async function vcDomains(args: McpArgs, meta: McpRequestMeta) {
  const projectId = resolveProject(str(args, "project"));
  const action = str(args, "action") ?? "list";
  const domain = str(args, "domain");
  if (action === "list") {
    const { data } = await vcApi("GET", `/v9/projects/${projectId}/domains`);
    const d = data as { domains: { name: string; verified: boolean; createdAt: number; redirect?: string | null }[] };
    return {
      count: d.domains.length,
      domains: d.domains.map((x) => ({ name: x.name, verified: x.verified, redirect: x.redirect ?? null, added: new Date(x.createdAt).toISOString() })),
    };
  }
  if (!domain) throw new McpToolError("domain إلزامي مع action=add|remove");
  if (action === "add") {
    await vcApi("POST", `/v9/projects/${projectId}/domains`, { name: domain });
    await writeAudit({
      adminId: null, action: "mcp.vercel_domain_add", entity: "VercelDomain", entityId: domain,
      meta: { via: "gemini-spark-mcp", projectId }, ip: meta.ip,
    });
    return { added: true, domain, note: "كوّن سجلات DNS حسب تعليمات Vercel ثم انتظر التحقق" };
  }
  if (action === "remove") {
    await vcApi("DELETE", `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
    await writeAudit({
      adminId: null, action: "mcp.vercel_domain_remove", entity: "VercelDomain", entityId: domain,
      meta: { via: "gemini-spark-mcp", projectId }, ip: meta.ip,
    });
    return { removed: true, domain };
  }
  throw new McpToolError("action يقبل list | add | remove فقط");
}

async function vcProjectInfo(args: McpArgs) {
  const projectId = resolveProject(str(args, "project"));
  const { data } = await vcApi("GET", `/v9/projects/${projectId}`);
  const p = data as {
    name: string; framework: string | null; nodeVersion: string | null;
    installCommand?: string | null; buildCommand?: string | null; devCommand?: string | null;
    latestDeployments?: { uid: string; readyState: string; createdAt: number }[];
  };
  const latest = p.latestDeployments?.[0];
  return {
    id: projectId,
    name: p.name,
    framework: p.framework,
    nodeVersion: p.nodeVersion,
    buildCommand: p.buildCommand ?? null,
    installCommand: p.installCommand ?? null,
    latestDeployment: latest ? { uid: latest.uid, state: latest.readyState, at: new Date(latest.createdAt).toISOString() } : null,
  };
}

/* المهام المجدولة تُقرأ من vercel.json في مستودع المشروع — مصدرها الرسمي في الكود */
async function vcGetCrons(args: McpArgs) {
  const projectKey = (str(args, "project") ?? "public").toLowerCase();
  const repo = projectKey === "admin" ? "kalam-admin-ziadamr" : "kalam-ziadamr";
  const res = await fetch(`https://api.github.com/repos/ziadamr45/${repo}/contents/vercel.json`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
      Accept: "application/vnd.github.raw",
      "User-Agent": "kalam-mcp-v4",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new McpToolError(`تعذر قراءة vercel.json من ${repo} (HTTP ${res.status})`);
  const config = (await res.json()) as { crons?: { path: string; schedule: string }[] };
  return {
    project: projectKey,
    repo,
    crons: config.crons ?? [],
    note: "المصدر: vercel.json في مستودع المشروع — لتعديلها عدّل الملف عبر gh_save_file ثم أعد النشر",
  };
}

/* ============================ الموزّع ============================ */

export async function executeVcTool(name: string, args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  switch (name) {
    case "vercel_list_deployments": return vcListDeployments(args);
    case "vercel_get_deployment": return vcGetDeployment(args);
    case "vercel_get_deployment_logs": return vcGetDeploymentLogs(args);
    case "vercel_redeploy": return vcRedeploy(args, meta);
    case "vercel_rollback": return vcRollback(args, meta);
    case "vercel_list_env": return vcListEnv(args);
    case "vercel_set_env": return vcSetEnv(args, meta);
    case "vercel_delete_env": return vcDeleteEnv(args, meta);
    case "vercel_domains": return vcDomains(args, meta);
    case "vercel_project_info": return vcProjectInfo(args);
    case "vercel_get_crons": return vcGetCrons(args);
    default: throw new McpToolError(`أداة Vercel غير معروفة: «${name}»`);
  }
}
