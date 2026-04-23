import Link from "next/link";

interface ReleaseRow {
  id: string;
  name: string;
  template_name: string;
  template_version: number;
  namespace: string;
}

export function ReleaseTable({ rows }: { rows: ReleaseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        아직 배포된 릴리스가 없습니다.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">이름</th>
            <th className="px-4 py-3 text-left font-medium">템플릿</th>
            <th className="px-4 py-3 text-left font-medium">네임스페이스</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border transition hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  href={`/releases/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.template_name}@v{r.template_version}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {r.namespace}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
