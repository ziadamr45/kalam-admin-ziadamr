/**
 * إنشاء حساب المالك — يُشغَّل مرة واحدة بعد إعداد قاعدة البيانات
 *   npm run admin:create
 * يقرأ ADMIN_USERNAME و ADMIN_BOOTSTRAP_PASSWORD من البيئة
 * وينشئ الحساب بتجزئة Argon2id كاملة
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordStrength } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    console.error("\n✗ أضف ADMIN_USERNAME و ADMIN_BOOTSTRAP_PASSWORD في ملف .env.local أولًا\n");
    process.exit(1);
  }

  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    console.error(`\n✗ كلمة المرور ضعيفة: ${strength.message}\n`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`
=====================================================
✓ تم إنشاء/تحديث حساب المالك بنجاح

  اسم المستخدم : ${admin.username}
  التشفير      : Argon2id (64MB / t=3 / p=4)

الخطوة التالية:
1. سجّل الدخول إلى لوحة التحكم باسم المستخدم وكلمة المرور
2. ستُحوَّل تلقائيًا لتفعيل التحقق بخطوتين (إلزامي)
3. امسح QR بتطبيق Google Authenticator أو 1Password
4. من هنا وحدها: كل دخول يحتاج الرمز المتغير اللحظي
=====================================================
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
