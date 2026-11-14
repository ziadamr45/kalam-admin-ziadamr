import { Suspense } from "react";
import { CommentsManager } from "@/components/comments-manager";

export const dynamic = "force-dynamic";

export default function CommentsPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-steel-400">جارٍ التحميل..</p>}>
      <CommentsManager />
    </Suspense>
  );
}
