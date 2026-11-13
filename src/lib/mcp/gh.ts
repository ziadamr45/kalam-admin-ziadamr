/**
 * أدوات البنية التحتية السيادية — GitHub (v4.0.0)
 * تحكم كامل (قراءة + إنشاء + تعديل + حذف) في مستودعي المنصة:
 * الموقع العام kalam-ziadamr واللوحة kalam-admin-ziadamr.
 * عبر REST API الرسمي بتوكن GITHUB_TOKEN (صلاحية repo).
 * كل عملية مغيّرة تُوثَّق في سجل التدقيق (AuditLog).
 */

import * as zlib from "node:zlib";
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
  const encoding = str(args, "encoding") ?? "utf8";
  if (!path || content === undefined) {
    throw new McpToolError("path وcontent إلزاميان — content هو النص الكامل الجديد للملف");
  }
  if (encoding !== "utf8" && encoding !== "base64") {
    throw new McpToolError("encoding يقبل utf8 (نص) | base64 (صور وأيقونات وملفات ثنائية) فقط");
  }
  /* base64: المحتوى الوارد مرمَّز مسبقًا — تحقق من سلامته وقس البايتات الفعلية */
  let rawBytes: number;
  if (encoding === "base64") {
    const decoded = Buffer.from(content, "base64");
    if (decoded.toString("base64").replace(/=+$/, "") !== content.replace(/=+$/, "")) {
      throw new McpToolError("محتوى base64 غير صالح — تأكد من الترميز الكامل بلا أسطر جديدة");
    }
    rawBytes = decoded.length;
    if (rawBytes > 3_000_000) {
      throw new McpToolError(`الملف أكبر من سقف البوابة (${rawBytes} بايت > 3MB) — ارفعه يدويًا أو قسّمه`);
    }
  } else {
    rawBytes = Buffer.byteLength(content, "utf8");
    if (rawBytes > 3_000_000) {
      throw new McpToolError(`الملف أكبر من سقف البوابة (${rawBytes} بايت > 3MB)`);
    }
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
    content: encoding === "base64" ? content : Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  });
  const r = data as { commit: { sha: string; html_url: string }; content: { html_url: string } };
  await writeAudit({
    adminId: null,
    action: "mcp.gh_save_file",
    entity: "GitHub",
    entityId: `${repo}:${path}`,
    meta: { via: "gemini-spark-mcp", branch, created: !sha, encoding, commit: r.commit?.sha, bytes: rawBytes },
    ip: meta.ip,
  });
  return {
    saved: true,
    created: !sha,
    repo,
    path,
    branch,
    encoding,
    bytes: rawBytes,
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

/* ============================ الكوميت الذرّي متعدد الملفات ============================ */

/**
 * كوميت ذرّي واحد لعدة ملفات عبر Git Data API (blobs → tree → commit → ref):
 * عدة تعديلات مترابطة تهبط دفعة واحدة فلا تُطلق إلا نشرة واحدة على Vercel،
 * بدل كوميت متتابع لكل ملف يسبق كل منها بناء كامل.
 */
async function ghCommitFiles(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const message = str(args, "message");
  if (!message) throw new McpToolError("رسالة الكوميت message إلزامية");
  const branch = str(args, "branch") ?? "main";
  const rawFiles = Array.isArray(args.files) ? (args.files as Record<string, unknown>[]) : [];
  if (rawFiles.length === 0) {
    throw new McpToolError("files إلزامية — مصفوفة [{ path, content, encoding?, op? }] على الأقل ملفًا واحدًا");
  }
  if (rawFiles.length > 25) {
    throw new McpToolError("سقف البوابة 25 ملفًا في الكوميت الواحد — قسّم الدفعة");
  }

  const files = rawFiles.map((f) => {
    const path = String(f.path ?? "").trim();
    const content = f.content === undefined || f.content === null ? null : String(f.content);
    const encoding = String(f.encoding ?? "utf8");
    const op = String(f.op ?? (content === null ? "delete" : "upsert"));
    if (!path) throw new McpToolError("كل ملف يحتاج path صالحًا");
    if (!["upsert", "delete"].includes(op)) throw new McpToolError(`op غير معروف للملف ${path} — upsert | delete`);
    if (!["utf8", "base64"].includes(encoding)) throw new McpToolError(`encoding غير معروف للملف ${path} — utf8 | base64`);
    if (op === "upsert" && content === null) throw new McpToolError(`الملف ${path} بحاجة content مع op=upsert`);
    if (op === "upsert" && content !== null) {
      const bytes = encoding === "base64" ? Buffer.from(content, "base64").length : Buffer.byteLength(content, "utf8");
      if (bytes > 3_000_000) throw new McpToolError(`الملف ${path} يتجاوز سقف 3MB`);
    }
    return { path, content, encoding, op };
  });

  /* 1) قمة الفرع المستهدف */
  const { data: refData } = await ghApi("GET", repo, `git/ref/heads/${encodeURIComponent(branch)}`);
  const baseSha = (refData as { object: { sha: string } }).object.sha;
  /* 2) شجرة الكوميت الحالية — أساس الشجرة الجديدة */
  const { data: commitData } = await ghApi("GET", repo, `git/commits/${baseSha}`);
  const baseTreeSha = (commitData as { tree: { sha: string } }).tree.sha;

  /* 3) إنشاء blobs للملفات المضافة/المعدلة */
  const tree: ({ path: string; mode: string; type: string; sha: string } | { path: string; sha: null })[] = [];
  const createdBlobs: { path: string; sha: string; bytes: number }[] = [];
  for (const f of files) {
    if (f.op === "delete") {
      tree.push({ path: f.path, sha: null }); // حذف من الشجرة
      continue;
    }
    const encoding = f.encoding === "base64" ? "base64" : "utf-8";
    const { data: blob } = await ghApi("POST", repo, "git/blobs", { content: f.content, encoding });
    const blobSha = (blob as { sha: string }).sha;
    const bytes =
      f.encoding === "base64" && f.content !== null
        ? Buffer.from(f.content, "base64").length
        : Buffer.byteLength(f.content ?? "", "utf8");
    createdBlobs.push({ path: f.path, sha: blobSha, bytes });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blobSha });
  }

  /* 4) شجرة جديدة فوق شجرة القمة */
  const { data: treeData } = await ghApi("POST", repo, "git/trees", {
    base_tree: baseTreeSha,
    tree,
  });
  const newTreeSha = (treeData as { sha: string }).sha;
  /* 5) كوميت الذرّة الواحدة */
  const { data: newCommit } = await ghApi("POST", repo, "git/commits", {
    message,
    tree: newTreeSha,
    parents: [baseSha],
  });
  const commitSha = (newCommit as { sha: string; html_url?: string }).sha;
  /* 6) تحريك الفرع */
  await ghApi("PATCH", repo, `git/refs/heads/${encodeURIComponent(branch)}`, {
    sha: commitSha,
    force: false,
  });

  await writeAudit({
    adminId: null,
    action: "mcp.gh_commit_files",
    entity: "GitHub",
    entityId: `${repo}:${branch}`,
    meta: {
      via: "gemini-spark-mcp",
      files: files.map((f) => `${f.op}:${f.path}`),
      commit: commitSha,
    },
    ip: meta.ip,
  });

  return {
    committed: true,
    repo,
    branch,
    message,
    files: files.map((f) => ({ path: f.path, op: f.op, ...(createdBlobs.find((b) => b.path === f.path) ?? {}) })),
    commit: { sha: commitSha },
    baseSha: baseSha.slice(0, 10),
    note: "كوميت ذرّي واحد — سيُطلق نشرة واحدة فقط على Vercel",
  };
}

/* ============================ طلبات الدمج Pull Requests ============================ */

async function ghListPulls(args: McpArgs) {
  const repo = resolveRepo(str(args, "repo"));
  const state = ["open", "closed", "all"].includes(str(args, "state") ?? "")
    ? (str(args, "state") as string)
    : "open";
  const { data } = await ghApi("GET", repo, `pulls?state=${state}&per_page=30&sort=updated&direction=desc`);
  const pulls = data as {
    number: number; title: string; state: string; draft: boolean;
    user: { login: string }; head: { ref: string; sha: string };
    base: { ref: string }; html_url: string; created_at: string; updated_at: string;
    mergeable_state?: string; changed_files?: number; commits?: number;
  }[];
  return {
    count: pulls.length,
    pulls: pulls.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      draft: p.draft,
      author: p.user?.login,
      head: `${p.head.ref}@${p.head.sha.slice(0, 10)}`,
      base: p.base.ref,
      mergeable_state: p.mergeable_state ?? null,
      changed_files: p.changed_files ?? null,
      created: p.created_at,
      updated: p.updated_at,
      url: p.html_url,
    })),
  };
}

async function ghManagePulls(args: McpArgs, meta: McpRequestMeta) {
  const repo = resolveRepo(str(args, "repo"));
  const action = str(args, "action") ?? "list";
  const number = num(args, "number");

  if (action === "list") return ghListPulls(args);

  if (action === "get") {
    if (!number) throw new McpToolError("رقم الطلب number إلزامي مع action=get");
    const { data } = await ghApi("GET", repo, `pulls/${number}`);
    const p = data as {
      number: number; title: string; state: string; merged: boolean; merged_at: string | null;
      body: string | null; user: { login: string }; head: { ref: string; sha: string };
      base: { ref: string }; html_url: string; mergeable_state: string | null; changed_files: number;
      commits: number; additions: number; deletions: number; created_at: string;
    };
    const { data: filesData } = await ghApi("GET", repo, `pulls/${number}/files?per_page=50`);
    const fileRows = filesData as { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
    return {
      number: p.number,
      title: p.title,
      state: p.state,
      merged: p.merged,
      author: p.user?.login,
      head: `${p.head.ref}@${p.head.sha.slice(0, 10)}`,
      base: p.base.ref,
      mergeable_state: p.mergeable_state,
      stats: { files: p.changed_files, commits: p.commits, additions: p.additions, deletions: p.deletions },
      body: p.body ?? null,
      created: p.created_at,
      url: p.html_url,
      files: fileRows.slice(0, 30).map((f) => ({
        file: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ? f.patch.slice(0, 3000) : undefined,
      })),
    };
  }

  if (action === "create") {
    const title = str(args, "title");
    const head = str(args, "head");
    const base = str(args, "base") ?? "main";
    if (!title || !head) throw new McpToolError("title وhead (الفرع المصدر) إلزاميان مع action=create");
    const body = str(args, "body") ?? "";
    const { data } = await ghApi("POST", repo, "pulls", { title, head, base, body });
    const p = data as { number: number; html_url: string; state: string };
    await writeAudit({
      adminId: null,
      action: "mcp.gh_pull_created",
      entity: "GitHub",
      entityId: `${repo}:pr-${p.number}`,
      meta: { via: "gemini-spark-mcp", head, base, title },
      ip: meta.ip,
    });
    return { created: true, number: p.number, state: p.state, url: p.html_url };
  }

  if (action === "comment") {
    if (!number) throw new McpToolError("رقم الطلب number إلزامي مع action=comment");
    const comment = str(args, "comment");
    if (!comment) throw new McpToolError("نص المراجعة comment إلزامي");
    const { data } = await ghApi("POST", repo, `issues/${number}/comments`, { body: comment });
    const c = data as { id: number; html_url: string };
    await writeAudit({
      adminId: null,
      action: "mcp.gh_pull_comment",
      entity: "GitHub",
      entityId: `${repo}:pr-${number}`,
      meta: { via: "gemini-spark-mcp", chars: comment.length },
      ip: meta.ip,
    });
    return { commented: true, number, comment_id: c.id, url: c.html_url };
  }

  if (action === "merge") {
    if (!number) throw new McpToolError("رقم الطلب number إلزامي مع action=merge");
    const mergeMethod = ["merge", "squash", "rebase"].includes(str(args, "merge_method") ?? "")
      ? (str(args, "merge_method") as string)
      : "merge";
    const commitTitle = str(args, "commit_title") ?? undefined;
    const { data } = await ghApi("PUT", repo, `pulls/${number}/merge`, {
      merge_method: mergeMethod,
      ...(commitTitle ? { commit_title: commitTitle } : {}),
    });
    const r = data as { merged: boolean; sha: string; message: string };
    await writeAudit({
      adminId: null,
      action: "mcp.gh_pull_merged",
      entity: "GitHub",
      entityId: `${repo}:pr-${number}`,
      meta: { via: "gemini-spark-mcp", method: mergeMethod, sha: r.sha?.slice(0, 10) },
      ip: meta.ip,
    });
    return { merged: r.merged, number, sha: r.sha?.slice(0, 10), method: mergeMethod, message: r.message };
  }

  if (action === "close") {
    if (!number) throw new McpToolError("رقم الطلب number إلزامي مع action=close");
    await ghApi("PATCH", repo, `pulls/${number}`, { state: "closed" });
    await writeAudit({
      adminId: null,
      action: "mcp.gh_pull_closed",
      entity: "GitHub",
      entityId: `${repo}:pr-${number}`,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { closed: true, number };
  }

  throw new McpToolError("action يقبل list | get | create | comment | merge | close فقط");
}

/**
 * البحث النصي داخل كود المستودعين — ينزّل tarball الفرع المطلوب (فهرسة جيت هب
 * الرسمية للبحث عبر API لا تشمل مستودعينا كليًا، فالحل الأمتن هو المصدر نفسه:
 * أرشيف الشجرة الكاملة) ويحلّله بمحلل tar خفيف في الذاكرة ويعيد المسارات
 * وأرقام الأسطر ومقتطف كل مطابقة — دقة سطرية مطلقة بلا انتظار فهرسة.
 */
const TAR_TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|txt|yml|yaml|prisma|sh|html|sql|svg|xml|toml|lock|env|example|gitignore)$/i;

function parseTarBuffer(buf: Buffer): { name: string; size: number; data: Buffer }[] {
  const entries: { name: string; size: number; data: Buffer }[] = [];
  let off = 0;
  let pendingPath: string | null = null;
  while (off + 512 <= buf.length && entries.length < 5000) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const nameField = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 345 + 155).toString("utf8").replace(/\0.*$/, "");
    const sizeStr = header.subarray(124, 124 + 12).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    const dataStart = off + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    if (typeflag === "L") {
      pendingPath = data.toString("utf8").replace(/\0.*$/, "");
    } else if (typeflag === "x" || typeflag === "g") {
      const m = /(?:^|\n)path=([^\n]*)/.exec(data.toString("utf8"));
      if (m && typeflag === "x") pendingPath = m[1];
    } else if (typeflag === "0" || typeflag === "\0" || typeflag === "") {
      let name = prefix ? `${prefix}/${nameField}` : nameField;
      if (pendingPath) name = pendingPath;
      entries.push({ name, size, data });
      pendingPath = null;
    }
    off = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

async function ghSearchCode(args: McpArgs): Promise<unknown> {
  const query = str(args, "query");
  if (!query) throw new McpToolError("كلمة البحث query إلزامية — مثال: NOTIFICATION_ASSETS");
  const limit = Math.min(Math.max(num(args, "limit") ?? 20, 1), 50);
  const repoChoice = (str(args, "repo") ?? "public").toLowerCase();
  const pathPrefix = str(args, "path")?.replace(/^\/+|\/+$/g, "");
  const caseSensitive = args.caseSensitive === true;
  const ref = str(args, "ref") ?? "main";

  const targets =
    repoChoice === "both" ? Object.entries(REPOS) : [[repoChoice, REPOS[repoChoice]] as [string, string]];
  if (!targets.length || targets.some(([, name]) => !name)) {
    throw new McpToolError(`مستودع غير معروف: «${repoChoice}» — المقبول: public | admin | both`);
  }
  const needle = caseSensitive ? query : query.toLowerCase();

  const searched: string[] = [];
  const matches: { repo: string; path: string; hits: { line: number; preview: string }[] }[] = [];
  let truncated = false;
  let filesScanned = 0;

  for (const [key, name] of targets) {
    const full = `${OWNER}/${name}`;
    const res = await fetch(`https://api.github.com/repos/${full}/tarball/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${ghToken()}`, "User-Agent": "kalam-mcp-v4" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new McpToolError(`تعذر تنزيل أرشيف ${full} عند ${ref} (${res.status}) — تحقق من الفرع`);
    }
    const gz = Buffer.from(await res.arrayBuffer());
    if (gz.length > 30_000_000) {
      throw new McpToolError(`أرشيف المستودع أكبر من سقف البحث (${Math.round(gz.length / 1e6)}MB > 30MB)`);
    }
    const entries = parseTarBuffer(zlib.gunzipSync(gz));
    searched.push(full);
    filesScanned += entries.length;

    for (const e of entries) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      if (e.size > 1_000_000 || e.size === 0) continue;
      const clean = e.name.split("/").slice(1).join("/"); /* إسقاط مجلد الجذر ziadamr45-repo-sha */
      if (pathPrefix && !(clean === pathPrefix || clean.startsWith(`${pathPrefix}/`))) continue;
      const textLike = TAR_TEXT_EXT.test(clean) || (!clean.includes(".") && e.size < 200_000);
      if (!textLike) continue;
      const text = e.data.toString("utf8");
      const lines = text.split("\n");
      const hits: { line: number; preview: string }[] = [];
      for (let i = 0; i < lines.length && hits.length < 5; i++) {
        const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (hay.includes(needle)) {
          hits.push({ line: i + 1, preview: lines[i].trim().slice(0, 200) });
        }
      }
      if (hits.length) matches.push({ repo: key, path: clean, hits });
    }
  }

  return {
    query,
    ref,
    searched,
    filesScanned,
    count: matches.length,
    truncated,
    matches,
    note:
      matches.length === 0
        ? "لا مطابقات في الأرشيف النصي — جرّب caseSensitive=false (الافتراضي)، أو تحقق من الإملاء، أو المسار قد يكون ثنائيًا غير ممسوح"
        : undefined,
  };
}

/* ============================ الموزّع ============================ */

export async function executeGhTool(name: string, args: McpArgs, meta: McpRequestMeta): Promise<unknown> {
  switch (name) {
    case "gh_get_repo": return ghGetRepo(args);
    case "gh_search_code": return ghSearchCode(args);
    case "gh_list_tree": return ghListTree(args);
    case "gh_get_file": return ghGetFile(args);
    case "gh_save_file": return ghSaveFile(args, meta);
    case "gh_commit_files": return ghCommitFiles(args, meta);
    case "gh_manage_pulls": return ghManagePulls(args, meta);
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
