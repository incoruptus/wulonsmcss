import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe2, Plus, RefreshCw, Trash2, Wrench, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import type { Instance, WorldPack } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";

const TYPES = [
  { value: "overworld", label: "主世界风格" },
  { value: "nether", label: "下界风格" },
  { value: "the_end", label: "末地风格" },
  { value: "superflat", label: "超平坦" },
  { value: "void", label: "虚空" },
];

export function WorldsTab({ instance }: { instance: Instance }) {
  const [packs, setPacks] = useState<WorldPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", label: "", type: "overworld", description: "" });
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<{ name: string; size: number; mtime: number }[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function loadBackups() {
    setBackups(await window.mcss.backup.list(instance.dir).catch(() => []));
  }

  async function load() {
    setLoading(true);
    try {
      setPacks(await window.mcss.worlds.scan(instance.dir));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  async function create() {
    if (!/^[a-z0-9_-]+$/i.test(draft.name)) {
      toast.error("世界名称只能包含字母、数字、下划线和连字符");
      return;
    }
    setBusy(true);
    try {
      const res = await window.mcss.worlds.create(instance.dir, { ...draft, namespace: "wulons" });
      if (!res.success) throw new Error(res.error || "创建失败");
      toast.success("世界数据包已生成", { description: "服务器运行中会自动 reload 生效" });
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
      <div className="flex items-center justify-between">
        <p className="t-label-13 text-gray-800">
          数据包生成的维度会出现在 <span className="t-mono-12">world/datapacks/</span> 下，多人可用同一套。
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            <RefreshCw className="size-3.5" />
            重新扫描
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const res = await window.mcss.worlds.repair(instance.dir);
              if (!res.success) return toast.error(res.error || "修复失败");
              toast.success(`已修复 ${res.fixed?.length ?? 0} 处`, {
                description: "旧版生成器产出的维度格式会让服务器起不来，已升级到 26.1 格式",
              });
              await load();
            }}
          >
            <Wrench className="size-3.5" />
            修复数据包
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            新建世界
          </Button>
        </div>
      </div>

      {packs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title="还没有自定义世界"
            desc="可以生成超平坦、虚空、下界风格等维度，作为挖矿场、跑酷图或活动场地。"
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                新建第一个世界
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
                    <Badge variant="gray" size="sm">{pack.worlds.length} 个维度</Badge>
                  </div>
                  {pack.description ? <p className="t-label-12 mt-0.5 text-gray-700">{pack.description}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const res = await window.mcss.worlds.remove(instance.dir, pack.name);
                    if (res.success) {
                      toast.success("已删除数据包（存档不会删）");
                      await load();
                    } else toast.error(res.error || "删除失败");
                  }}
                >
                  <Trash2 className="size-3.5" />
                  删除
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
            <h3 className="t-h-14 text-gray-1000">世界备份</h3>
            <Badge variant="gray" size="sm">{backups.length}</Badge>
          </div>
          <Button
            size="sm"
            loading={backupBusy}
            onClick={async () => {
              setBackupBusy(true);
              try {
                const res = await window.mcss.backup.create(instance.dir);
                if (!res.ok) throw new Error(res.error || "备份失败");
                toast.success(`已备份 ${res.name}`, { description: res.size ? formatBytes(res.size) : undefined });
                await loadBackups();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <Archive className="size-3.5" />
            立即备份
          </Button>
        </div>
        {backups.length === 0 ? (
          <div className="t-label-12 py-3 text-gray-700">
            还没有备份。备份会把整个 <span className="t-mono-12">world/</span> 打成 zip，服务器在跑时会先暂停写入。
          </div>
        ) : (
          <div className="max-h-[220px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center gap-2 py-1.5">
                <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{b.name}</span>
                <span className="t-label-12 shrink-0 text-gray-700">{formatBytes(b.size)}</span>
                <span className="t-label-12 shrink-0 text-gray-700">{formatDateTime(b.mtime)}</span>
                <Button variant="ghost" size="xs" onClick={() => setRestoring(b.name)}>
                  <RotateCcw className="size-3.5" />
                  恢复
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="hover:text-red-900"
                  onClick={async () => {
                    const res = await window.mcss.backup.remove(instance.dir, b.name);
                    if (res.ok) {
                      toast.success("已删除备份");
                      await loadBackups();
                    } else toast.error(res.error || "删除失败");
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={Boolean(restoring)} onOpenChange={(v) => !v && setRestoring(null)} widthClass="max-w-md">
        <DialogHeader title="恢复到这个备份？" desc="会先把当前的 world 改名留底，再解压备份。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            恢复前请确认服务器已经停止，否则会写坏存档。当前存档会被保留为 <span className="t-mono-12">world.before-restore-*</span>。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRestoring(null)}>取消</Button>
          <Button
            variant="error"
            onClick={async () => {
              const name = restoring!;
              setRestoring(null);
              const res = await window.mcss.backup.restore(instance.dir, name);
              if (res.ok) {
                toast.success("已恢复", { description: res.parked ? `旧世界留底为 ${res.parked}` : undefined });
              } else toast.error(res.error || "恢复失败");
            }}
          >
            恢复
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating} widthClass="max-w-lg">
        <DialogHeader title="新建世界" desc="会在服务端生成一份数据包，重启或 reload 后生效。" />
        <DialogBody className="space-y-3">
          <Field label="世界名称（英文，用于命名空间）">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="mining_world" />
          </Field>
          <Field label="显示名称">
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="挖矿世界" />
          </Field>
          <Field label="世界类型">
            <Select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              options={TYPES}
            />
          </Field>
          <Field label="描述">
            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="可留空" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setCreating(false)}>
            取消
          </Button>
          <Button onClick={create} loading={busy}>
            创建
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
