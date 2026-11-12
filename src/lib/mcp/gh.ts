/**
 * أدوات البنية التحتية السيادية — GitHub (v4.0.0)
 * تحكم كامل (قراءة + إنشاء + تعديل + حذف) في مستودعي المنصة:
 * الموقع العام kalam-ziadamr واللوحة kalam-admin-ziadamr.
 * عبر REST API الرسمي بتوكن GITHUB_TOKEN (صلاحية repo).
 * كل عملية مغيّرة تُوثَّق في سجل التدقيق (AuditLog).
 */

import { writeAudit } from "@/lib/guard";
import {
  McpToolError,
  str,
  num,
  type McpArgs,
  type McpRequestMeta,
} from "@/lib/mcp/base";

const OWNER = "ziadamr45";
const REPOS: Record<string, string> = {
  public: "kalam-ziadamr",
  admin: "kalam-admin-ziadamr",
};

function ghToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.length < 20) {
    throw new McpToolError(
      "متغير البيئة GITHUB_TOKEN غير مضبوط على الخادم — أضفه من إعدادات Vercel (توكن جيت هب بصلاحية repo) وأعد النشر",
    );
  }
  return token;
}

function resolveRepo(repo?: string): string {
  const key = (repo ?? "public").toLowerCase();
  const name = REPOS[key];
  if (!name) {
    throw new McpToolError(`مستودع غير معروف: «${repo}» — المقبول: public الموقع العام | admin لوحة الأدمن`);
  }
  return `${OWNER}/${name}`;
}

async function ghApi(
  method: string,
  repo: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  /* مسار فارغ = جذر المستودع — بلا شرطة مائلة آخرية وإلا رد جيت هب 404 */
  const url = path
    ? `https://api.github.com/repos/${repo}/${path}`
    : `https://api.github.com/repos/${repo}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "kalam-mcp-v4",
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
      typeof data === "object" && data !== null && "message" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : `HTTP ${res.status}`;
    throw new McpToolError(`جيت هب رفض الطلب (${res.status}): ${msg}`, data ?? undefined);
  }
  return { status: res.status, data };
}

/* ============================ الأدوات ============================ */

async function ghGetRepo(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const { data } = await ghApi("GET", repo, "");
  const r = data as Record<string, unknown>;
  const branches = await ghApi("GET", repo, "branches?per_page=30");
  return {
    full_name: r.full_name,
    default_branch: r.default_branch,
    private: r.private,
    description: r.description,
    pushed_at: r.pushed_at,
    branches: (branches.data as { name: string; commit: { sha: string } }[]).map((b) => ({
      name: b.name,
      sha: b.commit.sha.slice(0, 10),
    })),
  };
}

async function ghListTree(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const ref = str(args, "ref") ?? "main";
  const path = str(args, "path") ?? "";
  const { data } = await ghApi("GET", repo, `git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const t = data as { tree: { path: string; type: string; size?: number; sha: string }[]; truncated: boolean };
  let items = t.tree;
  if (path) items = items.filter((i) => i.path === path || i.path.startsWith(`${path}/`));
  return {
    ref,
    truncated: t.truncated,
    count: items.length,
    entries: items.slice(0, 300).map((i) => ({
      path: i.path,
      type: i.type,
      size: i.size ?? null,
      sha: i.sha.slice(0, 10),
    })),
  };
}

async function ghGetFile(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const path = str(args, "path");
  if (!path) throw new McpToolError("مسار الملف path إلزامي — مثال: src/app/layout.tsx");
  /* ref أو branch — تقبل التسميتين تفاديًا لالتباس العملاء */
  const ref = str(args, "ref") ?? str(args, "branch") ?? "main";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await ghApi("GET", repo, `contents/${encoded}?ref=${encodeURIComponent(ref)}`);
  const f = data as { content?: string; encoding?: string; sha: string; size: number; html_url: string };
  const content =
    f.content && f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : null;
  if (content === null) {
    throw new McpToolError(
      `الملف أكبر من النقل عبر الـAPI (${f.size} بايت) — استخدم gh_list_tree لاستكشافه أو قُسّمه`,
    );
  }
  return { path, sha: f.sha, size: f.size, url: f.html_url, content };
}

async function ghSaveFile(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const path = str(args, "path");
  const content = str(args, "content");
  const message = str(args, "message") ?? "تعديل عبر البوابة السيادية MCP";
  const branch = str(args, "branch") ?? "main";
  if (!path || content === undefined) {
    throw new McpToolError("path وcontent إلزاميان — content هو النص الكامل الجديد للملف");
  }
  /* sha الملف القائم تلقائيًا — وجوده يعني تحديثًا وغيابه إنشاءً */
  let sha: string | undefined = str(args, "sha");
  if (!sha) {
    try {
      const { data } = await ghApi("GET", repo, `contents/${path}?ref=${encodeURIComponent(branch)}`);
      sha = (data as { sha?: string }).sha;
    } catch {
      /* الملف غير موجود — إنشاء جديد */
    }
  }
  const { data } = await ghApi("PUT", repo, `contents/${path}`, {
    message,
    branch,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  });
  const r = data as { commit: { sha: string; html_url: string }; content: { html_url: string } };
  await writeAudit({
    adminId: null,
    action: "mcp.gh_save_file",
    entity: "GitHub",
    entityId: `${repo}:${path}`,
    meta: { via: "gemini-spark-mcp", branch, created: !sha, commit: r.commit?.sha, bytes: Buffer.byteLength(content) },
    ip: meta.ip,
  });
  return {
    saved: true,
    created: !sha,
    repo,
    path,
    branch,
    commit: { sha: r.commit?.sha, url: r.commit?.html_url },
  };
}

async function ghDeleteFile(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const path = str(args, "path");
  if (!path) throw new McpToolError("مسار الملف path إلزامي");
  const branch = str(args, "branch") ?? "main";
  const message = str(args, "message") ?? `حذف ${path} عبر البوابة السيادية MCP`;
  let sha = str(args, "sha");
  if (!sha) {
    const { data } = await ghApi("GET", repo, `contents/${path}?ref=${encodeURIComponent(branch)}`);
    sha = (data as { sha: string }).sha;
  }
  await ghApi("DELETE", repo, `contents/${path}`, { message, branch, sha });
  await writeAudit({
    adminId: null,
    action: "mcp.gh_delete_file",
    entity: "GitHub",
    entityId: `${repo}:${path}`,
    meta: { via: "gemini-spark-mcp", branch, reason: message },
    ip: meta.ip,
  });
  return { deleted: true, repo, path, branch };
}

async function ghListCommits(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const limit = Math.min(Math.max(num(args, "limit") ?? 15, 1), 50);
  const path = str(args, "path");
  const qs = new URLSearchParams({ per_page: String(limit) });
  if (path) qs.set("path", path);
  const { data } = await ghApi("GET", repo, `commits?${qs}`);
  return {
    count: (data as unknown[]).length,
    commits: (data as { sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }[]).map(
      (c) => ({
        sha: c.sha.slice(0, 10),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name,
        date: c.commit.author?.date,
        url: c.html_url,
      }),
    ),
  };
}

async function ghGetDiff(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const base = str(args, "base");
  const head = str(args, "head");
  if (!base || !head) throw new McpToolError("المرجعان base وhead إلزاميان — مثال: base=abc1234 head=main");
  const { data } = await ghApi("GET", repo, `compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  const c = data as {
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
    commits?: { sha: string; commit: { message: string } }[];
  };
  return {
    status: c.status,
    ahead_by: c.ahead_by,
    behind_by: c.behind_by,
    commits: (c.commits ?? []).slice(0, 30).map((x) => ({ sha: x.sha.slice(0, 10), message: x.commit.message.split("\n")[0] })),
    files: (c.files ?? []).slice(0, 40).map((f) => ({
      file: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ? f.patch.slice(0, 4000) : undefined,
    })),
  };
}

async function ghCreateBranch(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const branch = str(args, "branch");
  if (!branch) throw new McpToolError("اسم الفرع branch إلزامي");
  const from = str(args, "from") ?? "main";
  const { data: ref } = await ghApi("GET", repo, `git/ref/heads/${encodeURIComponent(from)}`);
  const sha = (ref as { object: { sha: string } }).object.sha;
  await ghApi("POST", repo, "git/refs", { ref: `refs/heads/${branch}`, sha });
  await writeAudit({
    adminId: null,
    action: "mcp.gh_create_branch",
    entity: "GitHub",
    entityId: `${repo}:${branch}`,
    meta: { via: "gemini-spark-mcp", from, sha: sha.slice(0, 10) },
    ip: meta.ip,
  });
  return { created: true, repo, branch, from, sha: sha.slice(0, 10) };
}

async function ghMergeBranch(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const base = str(args, "base");
  const head = str(args, "head");
  if (!base || !head) throw new McpToolError("base (الفرع المستقبل) وhead (المصدر) إلزاميان");
  const message = str(args, "message") ?? `دمج ${head} داخل ${base} عبر MCP`;
  const { data } = await ghApi("POST", repo, "merges", { base, head, commit_message: message });
  const r = data as { sha: string; message?: string } | { message: string };
  if ("message" in r && !("sha" in r)) {
    return { merged: false, note: r.message };
  }
  await writeAudit({
    adminId: null,
    action: "mcp.gh_merge_branch",
    entity: "GitHub",
    entityId: `${repo}:${base}<-${head}`,
    meta: { via: "gemini-spark-mcp", sha: (r as { sha: string }).sha?.slice(0, 10) },
    ip: meta.ip,
  });
  return { merged: true, repo, base, head, commit: (r as { sha: string }).sha?.slice(0, 10) };
}

async function ghDispatchWorkflow(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const workflow = str(args, "workflow");
  const ref = str(args, "ref") ?? "main";
  if (!workflow) throw new McpToolError("معرف ملف الـworkflow إلزامي — مثال: deploy.yml");
  const inputs = (args.inputs ?? {}) as Record<string, unknown>;
  const res = await ghApi("POST", repo, `actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { ref, inputs });
  await writeAudit({
    adminId: null,
    action: "mcp.gh_dispatch_workflow",
    entity: "GitHub",
    entityId: `${repo}:${workflow}`,
    meta: { via: "gemini-spark-mcp", ref, inputs },
    ip: meta.ip,
  });
  return { dispatched: true, repo, workflow, ref, httpStatus: res.status };
}

async function ghListActionRuns(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const limit = Math.min(Math.max(num(args, "limit") ?? 10, 1), 30);
  const { data } = await ghApi("GET", repo, `actions/runs?per_page=${limit}`);
  const r = data as {
    workflow_runs: {
      id: number; name: string; status: string; conclusion: string | null; head_branch: string;
      head_sha: string; created_at: string; html_url: string; event: string;
    }[];
  };
  return {
    count: r.workflow_runs.length,
    runs: r.workflow_runs.map((x) => ({
      id: x.id, workflow: x.name, status: x.status, conclusion: x.conclusion,
      branch: x.head_branch, sha: x.head_sha.slice(0, 10), event: x.event,
      created_at: x.created_at, url: x.html_url,
    })),
  };
}

async function ghGetActionRun(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const id = num(args, "run_id");
  if (!id) throw new McpToolError("معرف التشغيل run_id إلزامي — من gh_list_action_runs");
  const { data } = await ghApi("GET", repo, `actions/runs/${id}`);
  const r = data as { name: string; status: string; conclusion: string | null; html_url: string; run_started_at: string };
  const jobs = await ghApi("GET", repo, `actions/runs/${id}/jobs`);
  const j = jobs.data as { jobs: { name: string; status: string; conclusion: string | null; started_at: string; completed_at: string; steps?: { name: string; status: string; conclusion: string | null }[] }[] };
  return {
    run: { id, workflow: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url, started_at: r.run_started_at },
    jobs: j.jobs.map((x) => ({
      name: x.name, status: x.status, conclusion: x.conclusion,
      durationSec: x.completed_at && x.started_at ? Math.round((new Date(x.completed_at).getTime() - new Date(x.started_at).getTime()) / 1000) : null,
      steps: (x.steps ?? []).filter((s) => s.conclusion !== "skipped").map((s) => ({ step: s.name, conclusion: s.conclusion })),
    })),
  };
}

async function ghDependabotAlerts(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const state = str(args, "state") ?? "open";
  const { data } = await ghApi(
    "GET",
    repo,
    `dependabot/alerts?state=${encodeURIComponent(state)}&per_page=30`,
  );
  if (!Array.isArray(data)) return { alerts: [] };
  return {
    count: data.length,
    alerts: (data as {
      number: number; state: string;
      security_advisory: { summary: string; severity: string };
      dependency: { package: { name: string }; manifest_path: string; scope: string };
      security_vulnerability: { vulnerable_version_range: string; first_patched_version: { identifier: string } | null };
      created_at: string;
    }[]).map((a) => ({
      number: a.number,
      package: a.dependency?.package?.name,
      severity: a.security_advisory?.severity,
      summary: a.security_advisory?.summary,
      vulnerable_range: a.security_vulnerability?.vulnerable_version_range,
      patched: a.security_vulnerability?.first_patched_version?.identifier ?? null,
      manifest: a.dependency?.manifest_path,
      state: a.state,
      created_at: a.created_at,
    })),
  };
}

async function ghDeleteBranch(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const branch = str(args, "branch");
  if (!branch) throw new McpToolError("اسم الفرع branch إلزامي");
  const def = await ghApi("GET", repo, "");
  if ((def.data as { default_branch?: string }).default_branch === branch) {
    throw new McpToolError(`«${branch}» هو الفرع الافتراضي للمستودع — حذفه يدمّر النشر، مرفوض`);
  }
  await ghApi("DELETE", repo, `git/refs/heads/${encodeURIComponent(branch)}`);
  await writeAudit({
    adminId: null,
    action: "mcp.gh_delete_branch",
    entity: "GitHub",
    entityId: `${repo}:${branch}`,
    meta: { via: "gemini-spark-mcp" },
    ip: meta.ip,
  });
  return { deleted: true, repo, branch };
}

/* ============================ الموزّع ============================ */

export async function executeGhTool(name: string, args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  switch (name) {
    case "gh_get_repo": return ghGetRepo(args);
    case "gh_list_tree": return ghListTree(args);
    case "gh_get_file": return ghGetFile(args);
    case "gh_save_file": return ghSaveFile(args, meta);
    case "gh_delete_file": return ghDeleteFile(args, meta);
    case "gh_list_commits": return ghListCommits(args);
    case "gh_get_diff": return ghGetDiff(args);
    case "gh_create_branch": return ghCreateBranch(args, meta);
    case "gh_merge_branch": return ghMergeBranch(args, meta);
    case "gh_delete_branch": return ghDeleteBranch(args, meta);
    case "gh_dispatch_workflow": return ghDispatchWorkflow(args, meta);
    case "gh_list_action_runs": return ghListActionRuns(args);
    case "gh_get_action_run": return ghGetActionRun(args);
    case "gh_dependabot_alerts": return ghDependabotAlerts(args);
    default: throw new McpToolError(`أداة GitHub غير معروفة: «${name}»`);
  }
}
