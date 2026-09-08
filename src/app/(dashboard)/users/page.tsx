import { prisma } from "@/lib/prisma";
import { UsersTable } from "@/components/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { comments: true, interactions: true, savedArticles: true } },
    },
  });

  return (
    <UsersTable
      users={users.map((u) => ({
        id: u.id,
        name: u.name || "قارئ",
        email: u.email || "",
        image: u.image,
        customName: u.customName,
        customImage: u.customImage,
        bio: u.bio,
        impactScore: u.impactScore,
        intellectualRank: u.intellectualRank,
        banned: u.banned,
        banReason: u.banReason,
        commentsCount: u._count.comments,
        interactionsCount: u._count.interactions,
        savedCount: u._count.savedArticles,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
