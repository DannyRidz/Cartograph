"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createProgressClient } from "@/lib/supabase-progress";
import { getProgressSnapshots } from "@/app/workspace/analyses/actions";
import { isProgressMessage, mergeProgress, type ProgressSnapshot } from "@/lib/analysis-progress";

export function useLiveProgress(initial: ProgressSnapshot[], organizationId: string, watchNew = false) {
  const { getToken, orgId, isLoaded } = useAuth();
  const router = useRouter();
  const [updates, setUpdates] = useState<Record<string, ProgressSnapshot>>({});
  const [connectionError, setConnectionError] = useState("");
  const idsKey = initial.map((item) => item.id).sort().join(",");

  useEffect(() => {
    if (!isLoaded || orgId !== organizationId) return;
    const ids = idsKey ? idsKey.split(",") : [];
    let disposed = false;
    const revisions = new Map(ids.map((id) => [id, 0]));
    const joined = new Set<string>();
    const errors = new Set<string>();
    const client = createProgressClient(getToken);

    async function synchronise() {
      const before = new Map(revisions);
      try {
        const snapshots = await getProgressSnapshots(ids);
        if (disposed) return;
        if (snapshots.length !== ids.length) throw new Error("An analysis is no longer accessible. Refresh this page.");
        setUpdates((previous) => {
          const next = { ...previous };
          for (const item of snapshots) {
            // An event received during the snapshot request is newer than that read.
            if (before.get(item.id) === revisions.get(item.id)) next[item.id] = previous[item.id] ? mergeProgress(previous[item.id], item) : item;
          }
          return next;
        });
        if (!errors.size) setConnectionError("");
      } catch (error: unknown) {
        if (!disposed) setConnectionError(error instanceof Error ? error.message : "Could not synchronise progress.");
      }
    }

    async function connect() {
      try {
        await client.realtime.setAuth();
        if (disposed) return;
        for (const id of ids) {
          client.channel(`analysis:${id}`, { config: { private: true } })
            .on("broadcast", { event: "analysis_progress" }, (event: { payload: unknown }) => {
              if (disposed) return;
              const payload = event.payload;
              if (!isProgressMessage(payload)) {
                setConnectionError("An invalid progress message was received. Refresh this page.");
                return;
              }
              revisions.set(id, (revisions.get(id) ?? 0) + 1);
              const incoming = { id, ...payload, updatedAt: new Date().toISOString() };
              setUpdates((previous) => ({ ...previous, [id]: previous[id] ? mergeProgress(previous[id], incoming) : incoming }));
            })
            .subscribe((status) => {
              if (disposed) return;
              if (status === "SUBSCRIBED") {
                errors.delete(id);
                joined.add(id);
                if (joined.size === ids.length) void synchronise();
              } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                joined.delete(id);
                errors.add(id);
                setConnectionError("Live progress disconnected. Reconnecting; refresh if this message remains.");
              }
            });
        }
        if (watchNew) {
          client.channel(`organization:${organizationId}:analyses`, { config: { private: true } })
            .on("broadcast", { event: "analysis_created" }, () => { if (!disposed) router.refresh(); })
            .subscribe((status) => {
              if (disposed) return;
              if (status === "SUBSCRIBED") { errors.delete("history"); if (!errors.size) setConnectionError(""); router.refresh(); }
              else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                errors.add("history");
                setConnectionError("Live analysis history disconnected. Refresh if this message remains.");
              }
            });
        }
      } catch (error: unknown) {
        if (!disposed) setConnectionError(error instanceof Error ? error.message : "Could not connect to live progress.");
      }
    }
    void connect();
    return () => { disposed = true; void client.removeAllChannels(); };
  }, [getToken, idsKey, isLoaded, orgId, organizationId, router, watchNew]);

  return { progress: initial.map((item) => updates[item.id] ? mergeProgress(item, updates[item.id]) : item), connectionError };
}
