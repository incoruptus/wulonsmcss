import { useEffect, useState } from "react";
import { Check, FolderOpen, Gamepad2, Globe, Info, Minus, Palette, RotateCcw, Settings2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, SwitchRow } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Card, SegmentedControl, Badge } from "@/components/ui/misc";
import { detectShell } from "@/lib/shell";
import { SyncCard } from "@/components/app/SyncCard";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useConfig } from "@/stores/config";
import { PALETTES, type PaletteMeta } from "@/lib/themes";
import { cx } from "@/lib/utils";
import type { ThemeMode } from "@/lib/types";

export default function Settings() {
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const setMode = useConfig((s) => s.setMode);
  const [info, setInfo] = useState<{ version: string; electron: string; node: string; appData: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const isWeb = detectShell() === "web";

  useEffect(() => {
    window.mcss.app.info().then(setInfo).catch(() => {});
  }, []);

  return (
    <>
      <PageHeader className="max-w-4xl" title="设置" desc="把开服茶调成你顺手的样子。服务器文件和存档不会因外观设置而改变。" />
      <PageBody className="max-w-4xl space-y-5">
        <Card>
          <SectionHead icon={<Gamepad2 />} title="使用方式" desc="服主和玩家看到的首页与导航不同，数据始终保留。" />
          <div className="mt-5">
            <SegmentedControl
              value={cfg.mode}
              onValueChange={(value) => void setMode(value)}
              options={[{ value: "host", label: "我要开服" }, { value: "player", label: "我要进服" }]}
            />
          </div>
        </Card>

        <Card>
          <SectionHead icon={<Palette />} title="茶色" desc="五种茶底，只换气质，不换功能；成功、警告、危险仍用各自的红绿黄。" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="茶色主题">
            {PALETTES.map((palette) => (
              <PaletteCard
                key={palette.id}
                palette={palette}
                selected={cfg.palette === palette.id}
                onSelect={() => void patch({ palette: palette.id })}
              />
            ))}
          </div>
          <div className="mt-6 max-w-sm border-t border-gray-300 pt-5">
            <Field label="明暗" hint="同一套茶色在浅色和深色下会重新算对比度。">
              <SegmentedControl
                value={cfg.theme}
                onValueChange={(value) => patch({ theme: value as ThemeMode })}
                options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }, { value: "system", label: "跟随系统" }]}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionHead icon={<Settings2 />} title="运行与反馈" desc="控制日志占用和界面动态效果。" />
          <div className="mt-5 grid items-start gap-6 sm:grid-cols-2">
            <Field label="日志保留行数" hint="控制台与崩溃诊断只保留最近的记录">
              <Picker
                value={String(cfg.maxLogLines)}
                onValueChange={(value) => patch({ maxLogLines: Number(value) })}
                options={[{ value: "500", label: "500 行" }, { value: "1000", label: "1,000 行" }, { value: "3000", label: "3,000 行" }, { value: "10000", label: "10,000 行" }]}
              />
            </Field>
            <SwitchRow
              label="界面动态效果"
              hint="关闭后，按压和弹层过渡会立即完成"
              checked={cfg.animationsEnabled}
              onCheckedChange={(value) => patch({ animationsEnabled: value })}
            />
          </div>
        </Card>

        <SyncCard />

        {isWeb ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHead icon={<Globe />} title="网页版能力" desc="网页界面通过本机助手完成实际文件和服务器操作。" />
              <Badge variant="green" size="sm">本机助手已连接</Badge>
            </div>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="t-label-13 mb-2 font-medium text-gray-1000">可以做什么</div>
                <ul className="space-y-1.5 t-label-13 text-gray-800">
                  {["开服、停服、控制台与命令", "新建服务器、下载主流服务端", "加入游戏、准备客户端与进服包", "世界备份、恢复与时间机快照", "模组与插件扫描、资源库安装", "内网穿透与多世界数据包", "Java 探测与 AI 现场包导出"].map((text) => (
                    <li key={text} className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-green-900" />{text}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="t-label-13 mb-2 font-medium text-gray-1000">桌面版独有</div>
                <ul className="space-y-1.5 t-label-13 text-gray-800">
                  {["最小化、最大化和关闭窗口按钮", "无需本机助手，双击即可使用"].map((text) => (
                    <li key={text} className="flex items-center gap-2"><Minus className="size-3.5 shrink-0" />{text}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="t-copy-13 mt-5 rounded-lg bg-background-200 p-3 text-gray-800">本机助手只监听 127.0.0.1，并通过令牌配对。它处理本机操作，不会把你的服务器配置上传到第三方。</p>
          </Card>
        ) : null}

        <Card>
          <SectionHead icon={<Info />} title="关于开服茶" desc="Wulon's MCSS · 乌龙开服茶" />
          <dl className="mt-5 divide-y divide-gray-300">
            <InfoRow label="版本" value={info?.version ? `v${info.version}` : "—"} />
            <InfoRow label="Electron" value={info?.electron ?? "—"} />
            <InfoRow label="Node" value={info?.node ?? "—"} />
            <InfoRow label="数据目录" value={<span className="t-mono-12 break-all">{info?.appData ?? "—"}</span>} />
            <InfoRow label="模组数据" value={<span className="text-gray-800">Modrinth · MCIM · MC 百科中文名（经 PCL 整理）</span>} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!info} onClick={() => info && window.mcss.app.openPath(info.appData)}><FolderOpen className="size-3.5" />打开数据目录</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}><RotateCcw className="size-3.5" />重置全部设置</Button>
          </div>
        </Card>
      </PageBody>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset} widthClass="max-w-md">
        <DialogHeader title="重置全部设置？" desc="服务器列表、玩家记录、外观和同步设置都会被清空。" />
        <DialogBody><p className="t-copy-14 text-gray-800">磁盘上的服务器文件、模组和存档不会删除。重置后，开服茶会回到首次打开的状态。</p></DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>取消</Button>
          <Button variant="error" onClick={async () => { await window.mcss.config.reset(); setConfirmReset(false); location.reload(); }}>确认重置</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function PaletteCard({
  palette,
  selected,
  onSelect,
}: {
  palette: PaletteMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        "rounded-xl border p-2.5 text-left transition-colors",
        selected ? "border-brand-300 bg-brand-100/60" : "border-gray-300 bg-background-100 hover:bg-gray-100",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="t-label-13 font-medium text-gray-1000">{palette.name}</span>
        {selected ? <Check className="size-3.5 shrink-0 text-brand-700" /> : null}
      </span>
      <span className="mt-0.5 block t-label-12 text-gray-700">{palette.tea}</span>
      <span className="mt-2 block overflow-hidden rounded-md shadow-geist-border" aria-hidden="true">
        <span className="flex h-2.5">
          {palette.swatch.light.map((color, index) => (
            <span key={`l${index}`} className="flex-1" style={{ background: color }} />
          ))}
        </span>
        <span className="flex h-2.5">
          {palette.swatch.dark.map((color, index) => (
            <span key={`d${index}`} className="flex-1" style={{ background: color }} />
          ))}
        </span>
      </span>
      <span className="mt-2 block text-[11px] leading-4 text-gray-700">{palette.note}</span>
    </button>
  );
}

function SectionHead({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-brand-600 [&>svg]:size-[18px]">{icon}</span>
      <div><h2 className="t-h-16 text-gray-1000">{title}</h2><p className="t-copy-13 mt-1 text-gray-800">{desc}</p></div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="t-label-12 shrink-0 pt-0.5 text-gray-700">{label}</dt>
      <dd className="t-label-13 min-w-0 max-w-[75%] text-right text-gray-1000">{value}</dd>
    </div>
  );
}
