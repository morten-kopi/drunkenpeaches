import { AppNav } from "@/components/app-nav";
import { getClubContext } from "@/lib/club-context";

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}) {
  const { club } = await params;
  const ctx = await getClubContext(club);

  return (
    <div className="flex flex-1 flex-col">
      <AppNav
        clubSlug={ctx.club.slug}
        clubName={ctx.club.name}
        memberName={ctx.membership.full_name}
        isCommittee={ctx.isCommittee}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:pb-12 md:pt-10">
        {children}
      </main>
    </div>
  );
}
