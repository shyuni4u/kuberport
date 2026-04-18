const map: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${map[status] ?? "bg-slate-100"}`}
    >
      {status}
    </span>
  );
}
