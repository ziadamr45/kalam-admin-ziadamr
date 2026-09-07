import type { Metadata } from "next";
import { BroadcastConsole } from "@/components/broadcast-console";

export const metadata: Metadata = {
  title: "مركز الإشعارات الجماهيرية",
};

export default function NotificationsPage() {
  return <BroadcastConsole />;
}
