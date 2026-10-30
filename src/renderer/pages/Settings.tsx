import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, FolderOpen, Globe, Info, Minus, Palette, RotateCcw, Settings2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { SwitchRow } from "@/components/ui/field";
import { Card, SegmentedControl, Badge } from "@/components/ui/misc";
import { detectShell } from "@/lib/shell";
import { SyncCard } from "@/components/app/SyncCard";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useConfig } from "@/stores/config";
import type { ThemeMode } from "@/lib/types";

export default function Settings() {
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const [info, setInfo] = useState<{ version: string; electron: string; node: string; appData: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const isWeb = detectShell() === "web";

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
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">行为</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="日志保留行数" hint="控制台与崩溃诊断只保留最近这么多行">
              <Picker
                value={String(cfg.maxLogLines)}
                onValueChange={(v) => patch({ maxLogLines: Number(v) })}
                options={[
                  { value: "500", label: "500 行" },
                  { value: "1000", label: "1000 行" },
                  { value: "3000", label: "3000 行" },
                  { value: "10000", label: "10000 行" },
                ]}
              />
            </Field>
            <SwitchRow
              label="界面动画"
              hint="关闭后过渡与动效会缩短，低配机器更顺滑"
              checked={cfg.animationsEnabled}
              onCheckedChange={(v) => patch({ animationsEnabled: v })}
            />
          </div>
        </Card>

        <SyncCard />

        {isWeb ? (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Globe className="size-4 text-gray-800" />
              <h3 className="t-h-14 text-gray-1000">网页版能力</h3>
              <Badge variant="green" size="sm">与桌面版一致</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="t-label-12 mb-1 text-gray-700">已支持（靠本机助手）</div>
                <ul className="space-y-1 t-label-13 text-gray-1000">
                  {["开服 / 停服 / 控制台 / 命令", "新建实例 / 下载服务端（Paper、Purpur、Forge、NeoForge）", "加入房间、准备客户端、进服包", "世界备份与恢复、时间机快照", "Mod / 插件扫描、资源库安装", "内网穿透（FRP）", "多世界数据包生成", "Java 运行时探测", "AI 现场包导出"].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-green-900" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="t-label-12 mb-1 text-gray-700">只有桌面版有</div>
                <ul className="space-y-1 t-label-13 text-gray-700">
                  {["窗口按钮（最小化 / 最大化 / 关闭）", "不用装助手，双击即用"].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Minus className="size-3.5" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="t-label-12 mt-3 text-gray-700">
              网页版靠本机助手干活（只监听 127.0.0.1，令牌配对）。功能与桌面版一致，
              差别只有「窗口按钮」和「要不要装那个 261KB 的助手」。
            </p>
          </Card>
        ) : null}

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
            <InfoRow
              label="Mod 数据"
              value={<span className="text-gray-800">Modrinth · 中文简介 MCIM · 中文名 MC 百科（经 PCL 整理）</span>}
            />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => info && window.mcss.app.openPath(info.appData)}>
              <FolderOpen className="size-3.5" />
              打开数据目录
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
