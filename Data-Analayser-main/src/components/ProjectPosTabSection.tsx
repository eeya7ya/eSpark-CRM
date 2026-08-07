import Link from "next/link";
import { sql } from "@/lib/db";
import ProjectPosList, { type ProjectPoRow } from "@/components/ProjectPosList";

export default async function ProjectPosTabSection({
  projectId,
}: {
  projectId: number;
}) {
  const q = sql();
  const rows = (await q`
    select po.id, po.po_number, po.supplier, po.status,
           po.amount, po.currency, po.issued_at, po.expected_at,
           po.quotation_id, qq.ref as quotation_ref
    from purchase_orders po
    left join quotations qq on qq.id = po.quotation_id
    where po.project_id = ${projectId}
      and po.deleted_at is null
    order by po.issued_at desc nulls last, po.id desc
    limit 200
  `) as ProjectPoRow[];

  return (
    <section className="rounded-2xl border border-espark-border bg-espark-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-espark-ink">
            Purchase Orders
            <span className="ml-2 text-xs font-normal text-espark-ink/60">
              ({rows.length})
            </span>
          </h2>
          <p className="text-xs text-espark-ink/60">
            POs filed under this project. Convert a quotation to a PO from
            the quotation viewer.
          </p>
        </div>
        <Link
          href={`/purchase-orders?project=${projectId}`}
          className="rounded-lg border border-espark-primary text-espark-primary px-3 py-1.5 text-xs font-semibold hover:bg-espark-primary hover:text-white transition-colors"
        >
          Manage in legacy view →
        </Link>
      </div>

      <ProjectPosList rows={rows} />
    </section>
  );
}
