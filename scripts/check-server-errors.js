/* آخر أخطاء الخادم من ServerErrorLog — تشخيص فشل توليد PDF بالإنتاج */
const fs = require("fs");
const line = fs
  .readFileSync(".env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.serverErrorLog
  .findMany({ orderBy: { createdAt: "desc" }, take: 3 })
  .then((rows) => {
    for (const r of rows) {
      console.log("=== ", r.createdAt.toISOString(), r.app, r.path);
      console.log(String(r.message).slice(0, 500));
      console.log(String(r.stack ?? "").slice(0, 700).split("\n").slice(0, 6).join("\n"));
    }
    return p.$disconnect();
  })
  .catch((e) => {
    console.error("ERR:", String(e.message).slice(0, 200));
    process.exit(1);
  });
