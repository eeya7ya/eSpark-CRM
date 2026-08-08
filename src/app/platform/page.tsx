import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platformAuth";
import { hasControlPlane } from "@/lib/controlDb";
import { listCustomers, summarisePlatform } from "@/lib/platformOverview";
import PlatformConsole from "@/components/platform/PlatformConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform console",
  robots: { index: false, follow: false },
};

export default async function PlatformPage() {
  if (!hasControlPlane()) redirect("/");
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");

  // Identity, subscription and usage. Connection strings never leave the
  // server, and the only thing read from inside a workspace is its account
  // count — the quantity being sold, and nothing else.
  const customers = await listCustomers();

  return (
    <PlatformConsole
      adminName={admin.displayName}
      initialCustomers={customers}
      initialSummary={summarisePlatform(customers)}
      canCreateDatabase={Boolean(process.env.PROVISION_DATABASE_URL)}
    />
  );
}
