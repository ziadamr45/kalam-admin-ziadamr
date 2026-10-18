import { SiteSettingsForm } from "@/components/site-settings-form";
import { EmailChannelCard } from "@/components/email-channel-card";

export default function SiteSettingsPage() {
  return (
    <div className="space-y-6">
      <SiteSettingsForm />
      {/* قناة البريد المعاملاتي — تفعيل Resend بلصق المفتاح من الهاتف دون طرفية */}
      <EmailChannelCard />
    </div>
  );
}
