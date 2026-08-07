import Link from "next/link";
import { sql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAuthorQuotation } from "@/lib/modules";
import ProjectQuotationsList, {
  type ProjectQuotationRow,
} from "@/components/ProjectQuotationsList";

/**
 * Server component that fetches the quotations under a project and
 * renders the Quotations tab. Each CRM drill-down route reuses this
 * by passing the project id and the URL base that prefixes the
 * Designer / AI / Catalogue links inside.
 */
export default async function ProjectQuotationsTabSection({
  projectId,
  base,
}: {
  projectId: number;
  base: string;
}) {
  const q = sql();
  const rows = (await q`
    select id, ref, project_name, client_name, status,
           sales_approved_at, presales_approved_at, approved_at, rejected_at,
           totals_json, created_at
    from quotations
    where project_id = ${projectId}
      and deleted_at is null
    order by created_at desc
    limit 200
  `) as ProjectQuotationRow[];

  // Only presales / presales managers / admins author quotations here.
  // Sales request a quotation from the project header instead, so we hide
  // the Designer / AI / Catalogue entry points from them entirely.
  const user = await getSessionUser();
  const canCreate = user ? await canAuthorQuotation(user) : false;

  return (
    <section className="rounded-2xl border border-espark-border bg-espark-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-espark-ink">
            Quotations
            <span className="ml-2 text-xs font-normal text-espark-ink/60">
              ({rows.length})
            </span>
          </h2>
          <p className="text-xs text-espark-ink/60">
            Every quotation filed under this project. Use Designer / AI
            Designer / Catalogue to compose new ones.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`${base}/quotations/new`}
              className="rounded-lg bg-espark-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-espark-primary/90 transition-colors"
            >
              + Designer
            </Link>
            <Link
              href={`${base}/quotations/ai`}
              className="rounded-lg border border-espark-primary text-espark-primary px-3 py-1.5 text-xs font-semibold hover:bg-espark-primary hover:text-white transition-colors"
            >
              AI Designer
            </Link>
            <Link
              href={`${base}/quotations/catalogue`}
              className="rounded-lg border border-espark-border px-3 py-1.5 text-xs font-semibold text-espark-ink/70 hover:bg-espark-soft transition-colors"
            >
              Catalogue
            </Link>
          </div>
        )}
      </div>

      <ProjectQuotationsList rows={rows} base={base} />

      <p className="mt-3 text-[10px] text-espark-ink/40">
        Same rows are also reachable via the legacy /quotation viewer for
        any old bookmark.
      </p>
    </section>
  );
}
