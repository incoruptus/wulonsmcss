/**
 * 可达性 hook
 * ------------------------------------------------------------
 * 服主端和玩家端各一个入口，但都用同一份判定与同一套状态词。
 * 组件只关心 report / checking / refresh，不自己拼网络请求。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { checkHostReach, checkRoomReach } from "@/lib/reach-io";
import type { ReachReport, RoomAddresses } from "@/lib/reach";

export function useReach(port: number, opts?: { auto?: boolean }) {
  const [report, setReport] = useState<ReachReport | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);
  const auto = opts?.auto !== false;

  const run = useCallback(
    async (o?: { fresh?: boolean }) => {
      const id = ++seq.current;
      setChecking(true);
      try {
        const next = await checkHostReach(port, {
          ...o,
          // 本地/局域网先画出来，公网结果回来再补
          onPartial: (partial) => {
            if (id === seq.current) setReport(partial);
          },
        });
        if (id === seq.current) setReport(next);
        return next;
      } finally {
        if (id === seq.current) setChecking(false);
      }
    },
    [port],
  );

  useEffect(() => {
    if (auto) void run();
  }, [auto, run]);

  return { report, checking, refresh: run };
}

export function useRoomReach(room: RoomAddresses | null) {
  const [report, setReport] = useState<ReachReport | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async () => {
    if (!room) {
      setReport(null);
      return null;
    }
    const id = ++seq.current;
    setChecking(true);
    try {
      const next = await checkRoomReach(room);
      if (id === seq.current) setReport(next);
      return next;
    } finally {
      if (id === seq.current) setChecking(false);
    }
  }, [room]);

  useEffect(() => {
    void run();
  }, [run]);

  return { report, checking, refresh: run };
}
