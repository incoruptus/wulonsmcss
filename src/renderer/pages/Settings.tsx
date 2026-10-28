import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FolderOpen, Info, Palette, RotateCcw, Settings2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/field";
import { Card, SegmentedControl } from "@/components/ui/misc";
import { SyncCard } from "@/components/app/SyncCard";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useConfig } from "@/stores/config";
import type { ThemeMode } from "@/lib/types";
import { cx } from "@/lib/utils";

const ACCENTS = [
  { name: "Geist 蓝", hex: "#2f6feb" },
  { name: "雾紫", hex: "#7c5cff" },
  { name: "青瓷", hex: "#0d9488" },
  { name: "琥珀", hex: "#d97706" },
  { name: "赤陶", hex: "#dc2626" },
  { name: "苔绿", hex: "#16a34a" },
  { name: "石墨", hex: "#525252" },
];

export default function Settings() {
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const [info, setInfo] = useState<{ version: string; electron: string; node: string; appData: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    window.mcss.app.info().then(setInfo).catch(() => {});
  }, []);

  return (
    <>
      <PageHeader title="设置" desc="外观、行为与数据都在这里。" />
      <PageBody className="max-w-3xl space-y-4">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Palette className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">外观</h3>
          </div>

          <div className="space-y-4">
            <Field label="主题">
              <SegmentedControl
                value={cfg.theme}
                onValueChange={(v) => patch({ theme: v as ThemeMode })}
                options={[
                  { value: "light", label: "浅色" },
                  { value: "dark", label: "深色" },
                  { value: "system", label: "跟随系统" },
                ]}
              />
            </Field>

            <div>
              <div className="t-label-13 mb-2 font-medium text-gray-900">强调色</div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.hex}
                    title={a.name}
                    aria-label={a.name}
                    onClick={() => patch({ accent: a.hex })}
                    className={cx(
                      "size-7 rounded-full transition-transform hover:scale-110",
                      cfg.accent === a.hex
                        ? "ring-2 ring-gray-1000 ring-offset-2 ring-offset-background-200"
                        : "shadow-geist-border",
                    )}
                    style={{ background: a.hex }}
                  />
                ))}
                <label className="ml-1 flex cursor-pointer items-center gap-1.5 t-label-12 text-gray-800">
                  <input
                    type="color"
                    value={cfg.accent}
                    onChange={(e) => patch({ accent: e.target.value })}
                    className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    aria-label="自定义颜色"
                  />
                  自定义
                </label>
              </div>
            </div>

            <SwitchRow
              label="界面动画"
              hint="关闭后过渡与动效会缩短，低配机器更顺滑"
              checked={cfg.animationsEnabled}
              onCheckedChange={(v) => patch({ animationsEnabled: v })}
            />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">行为</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="控制台默认视图">
              <Select
                value={cfg.consoleViewMode}
                onChange={(e) => patch({ consoleViewMode: e.target.value as "code" | "bubble" })}
                options={[
                  { value: "code", label: "逐行（等宽）" },
                  { value: "bubble", label: "气泡" },
                ]}
              />
            </Field>
            <Field label="日志保留行数">
              <Select
                value={String(cfg.maxLogLines)}
                onChange={(e) => patch({ maxLogLines: Number(e.target.value) })}
                options={[
                  { value: "500", label: "500 行" },
                  { value: "1000", label: "1000 行" },
                  { value: "3000", label: "3000 行" },
                  { value: "10000", label: "10000 行" },
                ]}
              />
            </Field>
          </div>
        </Card>

        <SyncCard />

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Info className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">关于</h3>
          </div>
          <dl className="space-y-1.5">
            <InfoRow label="版本" value={`v${info?.version ?? "27.0.0"} · 重构版`} />
            <InfoRow label="Electron" value={info?.electron ?? "—"} />
            <InfoRow label="Node" value={info?.node ?? "—"} />
            <InfoRow label="数据目录" value={<span className="t-mono-12 break-all">{info?.appData ?? "—"}</span>} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => info && window.mcss.app.openPath(info.appData)}>
              <FolderOpen className="size-3.5" />
              打开数据目录
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.mcss.app.openExternal("https://github.com/")}
            >
              <ExternalLink className="size-3.5" />
              项目主页
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-3.5" />
              重置全部设置
            </Button>
          </div>
        </Card>
      </PageBody>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset} widthClass="max-w-md">
        <DialogHeader title="重置全部设置？" desc="实例列表、外观、快捷操作都会被清空；服务器文件不受影响。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">重置后应用会回到首次启动的状态。</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              await window.mcss.config.reset();
              setConfirmReset(false);
              location.reload();
            }}
          >
            重置
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="t-label-12 shrink-0 text-gray-700">{label}</dt>
      <dd className="t-label-13 min-w-0 text-right text-gray-1000">{value}</dd>
    </div>
  );
}
