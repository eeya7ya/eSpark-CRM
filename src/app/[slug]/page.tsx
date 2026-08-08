import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { getSubscriberBySlug, subscriberForUser, TOOLS } from "@/lib/subscribers";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

/**
 * A subscriber's own route — where they land after signing in.
 *
 * This is the last segment in the app's routing, so it only ever runs for a
 * path no real page claimed. `validateSlug` refuses to sell a slug that
 * collides with an existing route, so a subscriber can never shadow one.
 *
 * Who may open it:
 *   • the subscriber themselves (their login carries `subscriber_id`), and
 *   • the CRM owner, who sells and supports these subscriptions.
 * Anyone else is sent to their own home rather than told whether this
 * subscription exists.
 */
export default async function SubscriberHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/${encodeURIComponent(slug)}`);

  await ensureSchema();
  const subscriber = await getSubscriberBySlug(slug);
  if (!subscriber) notFound();

  const mine = await subscriberForUser(user.id);
  const isOwner = user.role === "admin" && mine === null;
  if (!isOwner && mine?.slug !== subscriber.slug) redirect("/");

  // What they bought. Null means every tool.
  const included =
    subscriber.tools === null
      ? TOOLS
      : TOOLS.filter((t) => subscriber.tools!.includes(t.id as string));

  return (
    <div className="min-h-screen bg-espark-soft/40">
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-espark-ink">
              {subscriber.name}
            </h1>
            <p className="mt-0.5 text-sm text-espark-ink/60">
              {subscriber.kind === "individual"
                ? "Your subscription — the tools below are yours to open."
                : "Your company's subscription — the tools below are what your team can use."}
            </p>
          </div>
          {isOwner && mine === null && (
            <Link
              href="/admin"
              className="rounded-lg border border-espark-border bg-espark-surface px-3 py-1.5 text-sm font-semibold text-espark-ink/75 hover:text-espark-ink"
            >
              Back to My CRM Admin
            </Link>
          )}
        </div>

        {subscriber.status === "suspended" && (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This subscription is suspended. Contact your provider to reinstate
            it.
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {included.map((t) => (
            <Link
              key={t.id}
              href={`/${t.id}`}
              className="rounded-2xl border border-espark-border bg-espark-surface p-4 transition-shadow hover:shadow-es-lift"
            >
              <p className="text-sm font-bold text-espark-ink">{t.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-espark-ink/55">
                {t.blurb}
              </p>
            </Link>
          ))}
        </div>

        {included.length === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-espark-border p-8 text-center text-sm text-espark-ink/50">
            No tools are included in this subscription yet.
          </p>
        )}
      </main>
    </div>
  );
}
