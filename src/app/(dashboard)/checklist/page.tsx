import { getChecklist, getSystemSettings } from "@/lib/settings";
import { ChecklistManager } from "@/components/checklist-manager";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const [checklist, settings] = await Promise.all([getChecklist(), getSystemSettings()]);
  return <ChecklistManager initial={checklist} autoApprove={settings.AUTO_APPROVE_COMMENTS} requireChecklist={settings.REQUIRE_CHECKLIST} />;
}
