import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { AccountInactive } from "@/components/AccountInactive";
import { AppBackground } from "@/components/AppBackground";
import { Sidebar } from "@/components/Sidebar";
import { RoleProvider } from "@/components/RoleContext";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await auth())?.user) redirect("/login");
  // Signed in, but removed from the team since: no app, only a sign-out.
  const session = await getSession();
  if (!session) return <AccountInactive />;

  return (
    <>
      <AppBackground />
      <div className="mx-auto flex max-w-[1340px] flex-col gap-3 p-4 lg:flex-row lg:items-start lg:gap-[18px] lg:px-6 lg:py-7">
        <Sidebar
          name={session.user.name ?? ""}
          email={session.user.email ?? ""}
        />
        <main className="glass w-full min-w-0 flex-1 p-[18px] sm:px-7 sm:pt-[26px] sm:pb-7">
          <RoleProvider role={session.user.role}>{children}</RoleProvider>
        </main>
      </div>
    </>
  );
}
