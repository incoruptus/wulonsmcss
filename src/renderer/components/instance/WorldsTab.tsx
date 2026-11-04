import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe2, Plus, RefreshCw, Trash2, Wrench, Archive, RotateCcw, History } from "lucide-react";
import { SwitchRow } from "@/components/ui/field";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import type { Instance, WorldPack } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";
import * as worldsApi from "@/lib/worlds";
import { dimensionSupport, dimensionSupportMessage } from "@/lib/mc-version";
import { isDesktopVisual } from "@/lib/shell";
import { useI18n } from "@/i18n";

const TYPES = [
  { value: "overworld", label: "主世界风格", key: "worlds.type.overworld" },
  { value: "nether", label: "下界风格", key: "worlds.type.nether" },
  { value: "the_end", label: "末地风格", key: "worlds.type.end" },
  { value: "superflat", label: "超平坦", key: "worlds.type.superflat" },
  { value: "void", label: "虚空", key: "worlds.type.void" },
];

export function WorldsTab({ instance }: { instance: Instance }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<WorldPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", label: "", type: "overworld", description: "" });
  const [busy, setBusy] = useState(false);
  const status = useServer((s) => s.status);
  const serverBusy = status === "running" || status === "starting" || status === "stopping";
  const [backups, setBackups] = useState<{ name: string; size: number; mtime: number }[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<{ name: string; at: number; files: number; bytesTotal: number; bytesNew: number; stored: number }[]>([]);
  const [snapBusy, setSnapBusy] = useState(false);
  const [restoringSnap, setRestoringSnap] = useState<string | null>(null);

  async function loadSnaps() {
    setSnaps(await window.mcss.backup.snapshots(instance.dir).catch(() => []));
  }
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const support = dimensionSupport(instance.mcVersion);
  const canGenerate = support === "supported";

  async function loadBackups() {
    setBackups(await window.mcss.backup.list(instance.dir).catch(() => []));
  }

  async function load() {
    setLoading(true);
    try {
      setPacks(await worldsApi.scan(instance.dir));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadBackups();
    void loadSnaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  async function create() {
    if (!canGenerate) {
      toast.error(dimensionSupportMessage(instance.mcVersion));
      return;
    }
    if (!/^[a-z0-9_-]+$/i.test(draft.name)) {
      toast.error(t("worlds.nameInvalid", "世界名称只能包含字母、数字、下划线和连字符"));
      return;
    }
    setBusy(true);
    try {
      const res = await worldsApi.create(instance.dir, { ...draft, namespace: "wulons" }, instance.mcVersion);
      if (!res.success) throw new Error(res.error || t("worlds.createFailed", "创建失败"));
      toast.success(t("worlds.created", "世界数据包已生成"), { description: t("worlds.createdDesc", "服务器运行期间会自动执行 reload 生效") });
      setCreating(false);
      setDraft({ name: "", label: "", type: "overworld", description: "" });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!canGenerate ? (
        <Callout
          tone="warning"
          title={support === "unsupported" ? t("worlds.unsupportedDatapack", "当前版本不支持数据包维度") : t("worlds.unsupportedMulti", "当前版本暂不支持多世界生成")}
        >
          {dimensionSupportMessage(instance.mcVersion)}
        </Callout>
      ) : null}

      <Callout tone="info" title={t("worlds.backupIntroTitle", "备份前先选对方式")}>
        {t("worlds.backupIntro", "想保存一份完整存档发给朋友，用「导出存档」；想回到之前的某个时间点，用下面的「时间机」。")}
      </Callout>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background-100 p-3 shadow-geist-border">
        <p className="t-label-13 text-gray-800">
          {t("worlds.datapackHint", "数据包生成的维度会出现在 ")}<span className="t-mono-12">world/datapacks/</span>{t("worlds.datapackHintTail", " 下，同一台服务器可共用一套。")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            <RefreshCw className="size-3.5" />
            {t("worlds.rescan", "重新扫描")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canGenerate}
            title={!canGenerate ? dimensionSupportMessage(instance.mcVersion) : undefined}
            onClick={async () => {
              const res = await worldsApi.repair(instance.dir, instance.mcVersion);
              if (!res.success) return toast.error(res.error || t("diagnosis.repairFailed", "修复失败"));
              toast.success(t("worlds.repaired", "已修复 {n} 处", { n: res.fixed?.length ?? 0 }), {
                description: t("worlds.repairedDesc", "旧版生成器产出的维度格式会导致服务器无法启动，已自动升级为 26.1 格式"),
              });
              await load();
            }}
          >
            <Wrench className="size-3.5" />
            {t("worlds.repairPack", "修复数据包")}
          </Button>
          <Button
            size="sm"
            disabled={!canGenerate}
            title={!canGenerate ? dimensionSupportMessage(instance.mcVersion) : undefined}
            onClick={() => setCreating(true)}
          >
            <Plus className="size-3.5" />
            {t("worlds.newWorld", "新建世界")}
          </Button>
        </div>
      </div>

      {packs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title={t("worlds.empty.title", "还没有自定义世界")}
            desc={t("worlds.empty.desc", "可生成超平坦、虚空、下界风格等维度，用作挖矿场、跑酷地图或活动场地。")}
            action={
              <Button disabled={!canGenerate} onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                {t("worlds.empty.action", "新建第一个世界")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <Card key={pack.name}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="t-h-14 text-gray-1000">{pack.name}</h3>
                    <Badge variant="gray" size="sm">{t("worlds.dimensionCount", "{n} 个维度", { n: pack.worlds.length })}</Badge>
                  </div>
                  {pack.description ? <p className="t-label-12 mt-0.5 text-gray-700">{pack.description}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const res = await worldsApi.remove(instance.dir, pack.name);
                    if (res.success) {
                      toast.success(t("worlds.deletedPack", "已删除数据包（存档不会删）"));
                      await load();
                    } else toast.error(res.error || t("worlds.deleteFailed", "删除失败"));
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t("worlds.delete", "删除")}
                </Button>
              </div>
              <div className="mt-3 divide-y divide-gray-300">
                {pack.worlds.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1.5">
                    <span className="t-mono-12 text-gray-1000">{w.id}</span>
                    <span className="t-label-12 text-gray-700">{w.generator || "—"}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 备份 */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">{t("worlds.exportSave", "导出存档")}</h3>
            <Badge variant="gray" size="sm">{backups.length}</Badge>
          </div>
          <Button
            size="sm"
            loading={backupBusy}
            onClick={async () => {
              setBackupBusy(true);
              try {
                const res = await window.mcss.backup.create(instance.dir);
                if (!res.ok) throw new Error(res.error || t("worlds.backupFailed", "备份失败"));
                toast.success(t("worlds.backupCreated", "已备份 {name}", { name: res.name }), { description: res.size ? formatBytes(res.size) : undefined });
                await loadBackups();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <Archive className="size-3.5" />
            {t("worlds.exportOne", "导出一份")}
          </Button>
        </div>
        {backups.length === 0 ? (
          <div className="t-label-12 py-3 text-gray-700">
            {t("worlds.exportEmpty", "尚未导出。完整导出会打包为 zip，适合分享或长期归档；日常回滚使用下方的「时间机」更节省空间。")}
          </div>
        ) : (
          <div className="max-h-[220px] divide-y divide-gray-300 overflow-y-auto scroll-thin">            {backups.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center gap-2 py-2">
                <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{b.name}</span>
                <span className="t-label-12 shrink-0 text-gray-700">{formatBytes(b.size)}</span>
                <span className="t-label-12 shrink-0 text-gray-700">{formatDateTime(b.mtime)}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={serverBusy}
                  title={serverBusy ? t("worlds.stopFirstRestore", "请先停止服务器再恢复") : t("worlds.restoreBackupTitle", "恢复这份备份")}
                  onClick={() => setRestoring(b.name)}
                >
                  <RotateCcw className="size-3.5" />
                  {t("worlds.restore", "恢复")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t("worlds.deleteBackupAria", "删除备份 {name}", { name: b.name })}
                  className="hover:text-red-900"
                  onClick={async () => {
                    if (!window.confirm(t("worlds.confirmDeleteBackup", "删除备份 {name}（{size}）？当前世界不受影响。", { name: b.name, size: formatBytes(b.size) }))) return;
                    const res = await window.mcss.backup.remove(instance.dir, b.name);
                    if (res.ok) {
                      toast.success(t("worlds.backupDeleted", "已删除备份"));
                      await loadBackups();
                    } else toast.error(res.error || t("worlds.deleteFailed", "删除失败"));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-gray-300 pt-3">
          {isDesktopVisual() ? (
            <SwitchRow
              label={t("worlds.autoBackupLabel", "停止服务器后自动备份")}
              hint={t("worlds.autoBackupHint", "停服时自动打包 world 目录，并按下列份数清理旧备份")}
              checked={Boolean(cfg.autoBackupOnStop)}
              onCheckedChange={(v) => patch({ autoBackupOnStop: v })}
            />
          ) : (
            <div className="rounded-lg bg-amber-700/10 p-2.5 t-label-12 text-amber-900">
              {t("worlds.autoBackupWebDesc", "停止服务器自动备份需要桌面版常驻进程，网页版可使用上方的「手动备份」。")}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="t-label-12 text-gray-700">{t("worlds.keepLast", "保留最近")}</span>
            <Picker
              className="w-[90px]"
              value={String(cfg.backupKeep ?? 5)}
              onValueChange={(v) => patch({ backupKeep: Number(v) })}
              options={[
                { value: "3", label: t("worlds.keepCount", "{n} 份", { n: 3 }) },
                { value: "5", label: t("worlds.keepCount", "{n} 份", { n: 5 }) },
                { value: "10", label: t("worlds.keepCount", "{n} 份", { n: 10 }) },
                { value: "20", label: t("worlds.keepCount", "{n} 份", { n: 20 }) },
              ]}
            />
            <Button
              size="xs"
              variant="secondary"
              disabled={!backups.length}
              onClick={async () => {
                const target = backups[backups.length - 1];
                if (!window.confirm(t("worlds.confirmDeleteOldest", "删除最旧的备份 {name}（{size}）？", { name: target.name, size: formatBytes(target.size) }))) return;
                const res = await window.mcss.backup.remove(instance.dir, target.name);
                if (!res.ok) return toast.error(res.error || t("worlds.cleanupFailed", "清理失败"));
                toast.success(t("worlds.oldestDeleted", "已删除最旧的一份"));
                await loadBackups();
              }}
            >
              {t("worlds.cleanupOldest", "清理最旧一份")}
            </Button>
          </div>
        </div>
      </Card>

      {/* 时间机：增量快照 */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">{t("worlds.timeMachine", "时间机")}</h3>
            <Badge variant="gray" size="sm">{snaps.length}</Badge>
          </div>
          <Button
            size="sm"
            loading={snapBusy}
            onClick={async () => {
              setSnapBusy(true);
              try {
                const res = await window.mcss.backup.snapshot(instance.dir);
                if (!res.ok) throw new Error(res.error || t("worlds.snapshotFailed", "快照失败"));
                toast.success(t("worlds.snapshotCreated", "已打快照 {name}", { name: res.name }), {
                  description: t("worlds.snapshotCreatedDesc", "{files} 个文件 · 新增 {size}", { files: res.files, size: formatBytes(res.bytesNew ?? 0) }),
                });
                await loadSnaps();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSnapBusy(false);
              }
            }}
          >
            <History className="size-3.5" />
            {t("worlds.takeSnapshot", "打个快照")}
          </Button>
        </div>

        <p className="t-label-12 text-gray-700">
          {t("worlds.timeMachineDesc", "日常回滚建议使用时间机：仅保存变化部分，未改动的文件在多个快照间共用，占用空间约等于「一份世界 + 改动」。还原前会自动备份当前存档。")}
        </p>

        {snaps.length === 0 ? (
          <div className="t-label-12 py-3 text-gray-700">{t("worlds.noSnapshots", "尚无快照。第一个快照为完整备份，后续快照仅记录增量。")}</div>
        ) : (
          <div className="mt-2 space-y-1">
            <div className="t-label-12 text-gray-700">
              {t("worlds.snapshotSummary", "共 {n} 个快照 · 磁盘实际占用 {size}", { n: snaps.length, size: formatBytes(snaps[0].stored) })}
              {(() => {
                const full = snaps.reduce((n, s) => n + s.bytesTotal, 0);
                if (!full) return null;
                const saved = Math.max(0, Math.round((1 - snaps[0].stored / full) * 100));
                return saved > 0 ? t("worlds.snapshotSaved", " · 相比保存 {n} 份完整存档，节省了 {pct}% 空间", { n: snaps.length, pct: saved }) : "";
              })()}
            </div>
            <div className="max-h-[200px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
              {snaps.map((s) => (
                <div key={s.name} className="flex items-center gap-2 py-1.5">
                  <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{s.name}</span>
                  <span className="t-label-12 shrink-0 text-gray-700">{formatDateTime(s.at)}</span>
                  <span className="t-label-12 shrink-0 text-gray-700">{t("worlds.fileCount", "{n} 文件", { n: s.files })}</span>
                  <span className="t-label-12 shrink-0 text-gray-700">+{formatBytes(s.bytesNew)}</span>
                  <Button variant="ghost" size="xs" onClick={() => setRestoringSnap(s.name)}>
                    <RotateCcw className="size-3.5" />
                    {t("worlds.restoreSnapshot", "还原")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Dialog open={Boolean(restoringSnap)} onOpenChange={(v) => !v && setRestoringSnap(null)} widthClass="max-w-md">
        <DialogHeader title={t("worlds.restoreSnapTitle", "还原到这个快照？")} desc={t("worlds.restoreSnapDesc", "会先将当前 world 目录改名备份，再按快照还原内容。")} />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            {t("worlds.restoreSnapBody", "服务器必须处于停止状态。当前存档会先备份为 ")}<span className="t-mono-12">world.before-restore-*</span>{t("worlds.restoreSnapBodyTail", "，之后仍可找回。")}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRestoringSnap(null)}>{t("worlds.cancel", "取消")}</Button>
          <Button
            variant="error"
            disabled={serverBusy}
            onClick={async () => {
              if (serverBusy) return toast.error(t("worlds.stopFirstRestoreSnap", "请先停止服务器再还原"));
              const name = restoringSnap!;
              setRestoringSnap(null);
              const res = await window.mcss.backup.restoreSnapshot(instance.dir, name);
              if (res.ok) {
                toast.success(t("worlds.restored", "已还原 {n} 个文件", { n: res.restored }), { description: res.parked ? t("worlds.restoredDesc", "旧存档留底为 {name}", { name: res.parked }) : undefined });
                await load();
              } else {
                toast.error(res.error || t("worlds.restoreFailed", "还原失败"));
              }
            }}
          >
            {t("worlds.restoreSnapshot", "还原")}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={Boolean(restoring)} onOpenChange={(v) => !v && setRestoring(null)} widthClass="max-w-md">
        <DialogHeader title={t("worlds.restoreBackupAsk", "恢复到这个备份？")} desc={t("worlds.restoreBackupDesc", "会先将当前 world 目录改名备份，再解压备份文件。")} />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            {t("worlds.restoreBackupBody", "恢复前请确认服务器已停止，运行中恢复可能损坏存档。当前存档会备份为 ")}<span className="t-mono-12">world.before-restore-*</span>{t("worlds.restoreBackupBodyTail", "。")}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRestoring(null)}>{t("worlds.cancel", "取消")}</Button>
          <Button
            variant="error"
            disabled={serverBusy}
            onClick={async () => {
              if (serverBusy) return toast.error(t("worlds.stopFirstRestore", "请先停止服务器再恢复"));
              const name = restoring!;
              setRestoring(null);
              const res = await window.mcss.backup.restore(instance.dir, name);
              if (res.ok) {
                toast.success(t("worlds.restoredSimple", "已恢复"), { description: res.parked ? t("worlds.restoredSimpleDesc", "旧世界留底为 {name}", { name: res.parked }) : undefined });
              } else toast.error(res.error || t("worlds.restoreBackupFailed", "恢复失败"));
            }}
          >
            {t("worlds.restore", "恢复")}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating} widthClass="max-w-lg">
        <DialogHeader title={t("worlds.newWorld", "新建世界")} desc={t("worlds.newWorldDesc", "会在服务端生成数据包，重启或执行 reload 后生效。")} />
        <DialogBody className="space-y-3">
          <Field label={t("worlds.field.name", "世界名称（英文，用于命名空间）")}>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="mining_world" />
          </Field>
          <Field label={t("worlds.field.label", "显示名称")}>
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t("worlds.labelPlaceholder", "挖矿世界")} />
          </Field>
          <Field label={t("worlds.field.type", "世界类型")}>
            <Picker value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })} options={TYPES.map((o) => ({ value: o.value, label: t(o.key, o.label) }))} />
          </Field>
          <Field label={t("worlds.field.desc", "描述")}>
            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("worlds.descPlaceholder", "可留空")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setCreating(false)}>
            {t("worlds.cancel", "取消")}
          </Button>
          <Button onClick={create} loading={busy}>
            {t("worlds.create", "创建")}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
