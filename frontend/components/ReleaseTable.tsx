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
      <div className="bg-white border rounded p-8 text-center text-sm text-slate-500">
        아직 배포된 릴리스가 없습니다.
      </div>
    );
  }
  return (
    <table className="w-full bg-white border rounded text-sm">
      <thead className="text-xs text-slate-500">
        <tr>
          <th className="p-2 text-left">이름</th>
          <th className="p-2 text-left">템플릿</th>
          <th className="p-2 text-left">네임스페이스</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="p-2">
              <Link href={`/releases/${r.id}`} className="text-blue-600">
                {r.name}
              </Link>
            </td>
            <td className="p-2">
              {r.template_name}@v{r.template_version}
            </td>
            <td className="p-2 font-mono text-xs">{r.namespace}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
