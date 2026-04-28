"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip, statusChipVariantFromRelease } from "./StatusChip";
import { termLabel } from "@/lib/kube-term-map";
import { useKubeTermsStore } from "@/stores/kube-terms-store";

export type Instance = {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
};

export function InstancesTable({
  releaseId,
  instances,
}: {
  releaseId: string;
  instances: Instance[];
}) {
  const kube = useKubeTermsStore((s) => s.showKubeTerms);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{termLabel("instanceId", kube)}</TableHead>
          <TableHead>{termLabel("status", kube)}</TableHead>
          <TableHead>{termLabel("restarts", kube)}</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((i) => (
          <TableRow key={i.name}>
            <TableCell className="font-mono text-xs">{i.name}</TableCell>
            <TableCell>
              <StatusChip
                variant={statusChipVariantFromRelease(
                  i.ready ? "healthy" : i.phase.toLowerCase(),
                )}
              >
                {i.phase}
              </StatusChip>
            </TableCell>
            <TableCell>{i.restarts}</TableCell>
            <TableCell>
              <Link
                href={`/releases/${releaseId}/logs?instance=${i.name}`}
                className="text-primary hover:underline text-xs"
              >
                로그 →
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
