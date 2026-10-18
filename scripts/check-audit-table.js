/* فحص جدول AuditTrail في إنتاج Neon — يقرأ .env صراحة */
const fs = require("fs");
const line = fs
  .readFileSync(".env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim();

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "AuditTrail"')
  .then((r) => {
    console.log("AuditTrail rows:", r[0].n);
    return p.$disconnect();
  })
  .catch((e) => {
    console.error("ERR:", String(e.message).slice(0, 300));
    process.exit(1);
  });
