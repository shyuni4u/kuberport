"use client";

import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LogEntry = { time: number; pod: string; text: string };

type Props = { releaseId: string; instances: { name: string }[] };

type Status = "connecting" | "connected" | "disconnected";

const LINE_CAP = 2000;

export function LogsPanel({ releaseId, instances }: Props) {
  const [instance, setInstance] = useState("all");
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [autoscroll, setAutoscroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setStatus("connecting");
    const es = new EventSource(
      `/api/v1/releases/${releaseId}/logs?instance=${encodeURIComponent(instance)}`,
    );
    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry;
        setLines((prev) => {
          const next = prev.length >= LINE_CAP ? prev.slice(-LINE_CAP + 1) : prev;
          return [...next, entry];
        });
      } catch {
        /* ignore malformed line */
      }
    });
    es.onopen = () => setStatus("connected");
    es.onerror = () => setStatus("disconnected");
    return () => {
      es.close();
    };
  }, [releaseId, instance]);

  useEffect(() => {
    if (!autoscroll) return;
    const el = boxRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [lines, autoscroll]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs">
        <ConnectionDot status={status} />
        <Select value={instance} onValueChange={setInstance}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 인스턴스</SelectItem>
            {instances.map((i) => (
              <SelectItem key={i.name} value={i.name}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="ml-auto inline-flex items-center gap-1">
          <Switch checked={autoscroll} onCheckedChange={setAutoscroll} />
          Auto-scroll
        </label>
        <button
          type="button"
          onClick={() => setLines([])}
          className="rounded border px-2 py-0.5 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>
      <div
        ref={boxRef}
        className="h-[60vh] overflow-auto rounded bg-slate-950 p-3 font-mono text-[12px] leading-relaxed text-slate-100"
      >
        {lines.map((l, idx) => (
          <div key={idx} className="whitespace-pre">
            <span className="text-slate-500">
              [{new Date(l.time).toLocaleTimeString()}]
            </span>{" "}
            <span className="text-cyan-300">[{l.pod}]</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionDot({ status }: { status: Status }) {
  const color =
    status === "connected"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-red-500";
  const label =
    status === "connected"
      ? "연결됨"
      : status === "connecting"
        ? "연결 중"
        : "끊김";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
