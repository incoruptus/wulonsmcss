import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Play, Wrench, XCircle } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import type { Instance, PreflightIssue, PreflightResult } from "@/lib/types";

/**
 * 开服前预检弹窗：把「点启动 → 闪退」变成「启动前说清楚 + 一键修」。
 */
export function PreflightDialog({
  open,
  onOpenChange,
  instance,
  onStarted,
  autoStart = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
  onStarted?: () => void;
  autoStart?: boolean;
}) {
  const updateInstance = useConfig((s) => s.updateInstance);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const res = await window.mcss.server.preflight(instance.id);
      setResult(res);
      // 一切正常就直接启动，不打扰用户
      if (res.ok && res.issues.length === 0 && autoStart) {
        await startServer();
        return;
      }
    } catch (e) {
      setResult({ ok: false, issues: [{ id: "preflight-failed", level: "error", title: "预检失败", detail: (e as Error).message }] });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setResult(null);
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance.id]);

  async function startServer() {
    setStarting(true);
    const res = await window.mcss.server.start(instance.id).catch((e) => ({ ok: false, error: (e as Error).message }));
    setStarting(false);
    if (res.ok) {
      onOpenChange(false);
      onStarted?.();
    } else {
      toast.error(res.error || "启动失败");
    }
  }

  async function applyFix(issue: PreflightIssue) {
    setFixing(issue.id);
    try {
      switch (issue.fix) {
        case "repair-datapacks": {
          const res = await window.mcss.worlds.repair(instance.dir);
          if (!res.success) throw new Error(res.error || "修复失败");
          toast.success(`已修复 ${res.fixed?.length ?? 0} 处维度定义`);
          break;
        }
        case "accept-eula": {
          await window.mcss.fs.write(`${instance.dir}\\eula.txt`, "eula=true\n");
          toast.success("已同意 EULA");
          break;
        }
        case "set-java": {
          const picked = await window.mcss.app.pickJava();
          if (!picked) return;
          await updateInstance(instance.id, { javaPath: picked });
          toast.success("Java 路径已更新");
          break;
        }
        case "change-port":
        case "lower-memory":
          toast.info("在实例设置里改一下就好");
          onOpenChange(false);
          return;
        default:
          toast.info("这条需要你手动处理");
          return;
      }
      await check();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFixing(null);
    }
  }

  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warns = result?.issues.filter((i) => i.level === "warn") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-lg">
      <DialogHeader
        title={checking ? "正在检查…" : errors.length ? "还不能开服" : warns.length ? "可以开服，但有提醒" : "一切就绪"}
        desc={checking ? "Java、端口、EULA、数据包、内存、磁盘都会过一遍" : `${instance.name} · ${instance.mcVersion} · ${instance.loader}`}
      />
      <DialogBody className="space-y-2">
        {checking ? (
          <div className="flex items-center gap-2 py-6 t-label-13 text-gray-700">
            <Loader2 className="size-4 animate-spin" />
            正在检查运行环境…
          </div>
        ) : !result ? null : result.issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-800/10 p-3">
            <CheckCircle2 className="size-4 text-green-900" />
            <span className="t-label-13 text-green-900">六项检查全部通过，直接启动。</span>
          </div>
        ) : (
          <>
            {errors.map((issue) => (
              <IssueRow key={issue.id} issue={issue} busy={fixing === issue.id} onFix={() => applyFix(issue)} />
            ))}
            {warns.map((issue) => (
              <IssueRow key={issue.id} issue={issue} busy={fixing === issue.id} onFix={() => applyFix(issue)} />
            ))}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          variant={errors.length ? "secondary" : "default"}
          onClick={startServer}
          loading={starting}
          disabled={checking || errors.length > 0}
          title={errors.length ? "先修掉红色问题再启动" : undefined}
        >
          <Play className="size-4" />
          {errors.length ? "修好后再启动" : "启动服务器"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function IssueRow({
  issue,
  busy,
  onFix,
}: {
  issue: PreflightIssue;
  busy: boolean;
  onFix: () => void;
}) {
  const isError = issue.level === "error";
  return (
    <div className={`rounded-lg p-3 ${isError ? "bg-red-700/10" : "bg-amber-700/10"}`}>
      <div className="flex items-start gap-2">
        {isError ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-900" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-900" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`t-label-13 font-medium ${isError ? "text-red-900" : "text-amber-900"}`}>{issue.title}</span>
            <Badge variant={isError ? "red" : "amber"} size="sm">
              {isError ? "必须处理" : "提醒"}
            </Badge>
          </div>
          <div className="t-label-12 mt-0.5 text-gray-800">{issue.detail}</div>
          {issue.samples?.length ? (
            <div className="t-mono-12 mt-1 truncate text-gray-700">{issue.samples.join("、")}…</div>
          ) : null}
        </div>
        {issue.fix ? (
          <Button size="xs" variant="secondary" onClick={onFix} loading={busy} className="shrink-0">
            <Wrench className="size-3" />
            修复
          </Button>
        ) : null}
      </div>
    </div>
  );
}
