import { useCallback, useEffect, useState } from "react";
import type { NetDoctor } from "@/lib/types";

export function useNetDoctor(opts?: { auto?: boolean }) {
  const [doctor, setDoctor] = useState<NetDoctor | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = opts?.auto !== false;

  const run = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const next = await window.mcss.net.doctor();
      setDoctor(next);
      return next;
    } catch (e) {
      setError((e as Error)?.message || "体检失败");
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (auto) void run();
  }, [auto, run]);

  return { doctor, checking, error, refresh: run };
}
