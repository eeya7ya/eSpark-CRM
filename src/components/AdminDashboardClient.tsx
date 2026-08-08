"use client";

import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  ShieldCheck,
  Layers,
  Lock,
  Unlock,
  Building2,
  type LucideIcon,
} from "@/lib/icons";
import MessagesPanel from "@/components/MessagesPanel";

/**
 * The administration board.
 *
 * It answers two questions, in the order an admin actually asks them:
 *
 *   1. What has this workspace LICENSED?  (`workspaces.modules`, the licence
 *      tier — what the company pays for.)
 *   2. Who holds a SEAT in each licensed module?  (`user_module_roles`, the
 *      per-user tier — who inside the company may open it, and as what.)
 *
 * The second is bounded by the first: an admin can hand out roles all they
 * like, but only within the modules the company licensed, which is exactly
 * what `workspaceLicenses()` enforces server-side. Showing the two tiers
 * stacked is the point of this board — an unlicensed module with seats on it
 * is a real situation (the licence lapsed, the grants did not) and it is
 * invisible if you only ever look at one of them.
 *
 * There is deliberately no quotation data here. Counting quotations mixed the
 * sales OUTPUT of the people holding seats in with the access decisions this
 * page exists to drive, and the CRM dashboard already owns those numbers.
 */

/** One module, with both tiers resolved for it. */
export interface ModuleRow {
  module: string;
  label: string;
  blurb: string;
  /** Licence tier: does the workspace pay for this module at all? */
  licensed: boolean;
  /** Seat tier: distinct users holding at least one active role in it. */
  seats: number;
}

export interface DepartmentRow {
  /** Department code (e.g. "ITD1"); "Unassigned" groups users with no code. */
  code: string;
  users: number;
}

export interface AdminDashboardData {
  kpis: {
    users: number;
    admins: number;
    withRole: number;
    /** Users holding no active grant anywhere — the ones still to action. */
    noAccess: number;
    departments: number;
  };
  subscription: {
    /** Null on a single-tenant install with no control plane. */
    workspaceName: string | null;
    /** True when every module is licensed (the documented default). */
    unlimited: boolean;
    licensedCount: number;
    totalModules: number;
  };
  modules: ModuleRow[];
  departments: DepartmentRow[];
}

export default function AdminDashboardClient({
  data,
  greetingName,
}: {
  data: AdminDashboardData;
  greetingName: string;
}) {
  const { kpis, subscription, modules, departments } = data;

  // Chart the seat distribution across the modules the workspace can actually
  // use. Unlicensed modules are excluded rather than drawn at zero: they are
  // not a staffing gap to close, they are simply not part of the subscription.
  const seatChart = modules
    .filter((m) => m.licensed)
    .map((m) => ({ label: m.label, seats: m.seats }));
  const anySeats = seatChart.some((m) => m.seats > 0);

  // Seats standing on a module the workspace no longer licenses. Those users
  // are already blocked server-side, so this is a cleanup prompt, not an
  // access leak — but it is the one thing on this page that is silently wrong.
  const strandedSeats = modules.filter((m) => !m.licensed && m.seats > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-espark-ink">
          Welcome back, {greetingName}.
        </h1>
        <p className="mt-0.5 text-sm text-espark-ink/60">
          Administration overview — your subscription, and who has access to
          what.
        </p>
      </div>

      {/* Headline strip. "Without access" is last and deliberately the one
          that reads as a to-do: those users can sign in but reach nothing. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Users" value={kpis.users} icon={Users} tone="indigo" />
        <Kpi label="Admins" value={kpis.admins} icon={ShieldCheck} tone="red" />
        <Kpi
          label="Modules licensed"
          value={
            subscription.unlimited
              ? String(subscription.totalModules)
              : `${subscription.licensedCount}/${subscription.totalModules}`
          }
          icon={Layers}
          tone="cyan"
        />
        <Kpi
          label="Without access"
          value={kpis.noAccess}
          icon={Lock}
          tone={kpis.noAccess > 0 ? "amber" : "violet"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ── Tier 1: the subscription ───────────────────────────────── */}
          <Panel
            title="Subscription"
            subtitle={
              subscription.unlimited
                ? `${subscription.workspaceName ?? "This workspace"} — every module licensed`
                : `${subscription.workspaceName ?? "This workspace"} — ${subscription.licensedCount} of ${subscription.totalModules} modules licensed`
            }
            action={{ href: "/admin?tab=subscription", label: "Manage" }}
          >
            {strandedSeats.length > 0 && (
              <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>
                  {strandedSeats.map((m) => m.label).join(", ")}
                </strong>{" "}
                {strandedSeats.length === 1 ? "still has" : "still have"} seats
                assigned but {strandedSeats.length === 1 ? "is" : "are"} not
                licensed. Those users are already blocked — revoke the roles to
                tidy up, or license the module again.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {modules.map((m) => (
                <ModuleCard key={m.module} row={m} />
              ))}
            </div>
          </Panel>

          {/* ── Tier 2: the seats inside it ────────────────────────────── */}
          <Panel
            title="Seats per module"
            subtitle="People holding at least one role in each licensed module"
            action={{ href: "/admin?tab=users", label: "Grant access" }}
          >
            {!anySeats ? (
              <EmptyChart note="No roles granted yet." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={seatChart}
                    margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#E4E7F1"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      // Recharts wraps a tick that outgrows its band, which
                      // breaks the long labels mid-word ("Adminis tration").
                      // Truncating keeps every module on the axis — `interval`
                      // is 0 precisely so none of them is dropped.
                      tickFormatter={(v: string) =>
                        v.length > 11 ? `${v.slice(0, 10)}…` : v
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(91,120,132,0.06)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E4E7F1",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="seats"
                      name="Seats"
                      fill="#5b7884"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* People, grouped the way the org is — users only. */}
          <Panel
            title="People by department"
            subtitle="Headcount grouped by department code"
          >
            {departments.length === 0 ? (
              <p className="py-6 text-center text-xs text-espark-ink/40">
                No users yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-espark-border text-left text-xs text-espark-ink/50">
                      <th className="px-3 py-2 font-semibold">Department</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Users
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr
                        key={d.code}
                        className="border-b border-espark-border/60 last:border-0"
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-espark-ink">
                          {d.code}
                        </td>
                        <td className="px-3 py-2 text-right text-espark-ink/80">
                          {d.users}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Inbox — alarms + messages */}
        <div className="lg:col-span-1">
          <div className="h-[560px]">
            <MessagesPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One module: what it is, whether the workspace licenses it, and how many
 * people are in it. An unlicensed module is dimmed rather than hidden — an
 * admin deciding what to buy needs to see what they are not buying.
 */
function ModuleCard({ row }: { row: ModuleRow }) {
  const { label, blurb, licensed, seats } = row;
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        licensed
          ? "border-espark-border bg-espark-surface"
          : "border-dashed border-espark-border/70 bg-espark-soft/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`truncate text-sm font-semibold ${
              licensed ? "text-espark-ink" : "text-espark-ink/45"
            }`}
          >
            {label}
          </p>
          <p
            className={`mt-0.5 text-xs leading-snug ${
              licensed ? "text-espark-ink/55" : "text-espark-ink/35"
            }`}
          >
            {blurb}
          </p>
        </div>
        <span
          className={`inline-flex flex-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            licensed
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-espark-border bg-espark-soft text-espark-ink/45"
          }`}
        >
          {licensed ? (
            <Unlock className="h-3 w-3" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
          {licensed ? "Licensed" : "Not licensed"}
        </span>
      </div>
      <p
        className={`mt-2 text-xs ${
          licensed ? "text-espark-ink/70" : "text-espark-ink/35"
        }`}
      >
        <span className="font-semibold tabular-nums">{seats}</span>{" "}
        {seats === 1 ? "seat" : "seats"}
      </p>
    </div>
  );
}

const TONES: Record<string, { ring: string; icon: string }> = {
  red: { ring: "from-espark-primary/15 to-espark-surface", icon: "bg-espark-primary/10 text-espark-primary" },
  indigo: { ring: "from-indigo-100 to-espark-surface", icon: "bg-indigo-100 text-indigo-600" },
  cyan: { ring: "from-cyan-100 to-espark-surface", icon: "bg-cyan-100 text-cyan-600" },
  violet: { ring: "from-violet-100 to-espark-surface", icon: "bg-violet-100 text-violet-600" },
  amber: { ring: "from-amber-100 to-espark-surface", icon: "bg-amber-100 text-amber-700" },
};

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  /** String for ratios like "6/9"; number for plain counts. */
  value: number | string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`rounded-2xl border border-espark-border bg-gradient-to-br ${t.ring} p-4 shadow-es-soft transition-shadow hover:shadow-es-lift`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${t.icon}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-espark-ink tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-espark-ink/55">{label}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Optional deep link into the tab that acts on this panel. */
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-espark-border bg-espark-surface/80 p-4 shadow-es-soft backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-espark-ink">{title}</h3>
          {subtitle && (
            <p className="text-xs text-espark-ink/50">{subtitle}</p>
          )}
        </div>
        {action && (
          <Link
            href={action.href}
            className="flex-none rounded-lg border border-espark-border px-2.5 py-1 text-xs font-semibold text-espark-ink/70 transition-colors hover:bg-espark-soft hover:text-espark-ink"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ note }: { note: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-center">
      <p className="text-xs text-espark-ink/40">{note}</p>
    </div>
  );
}
