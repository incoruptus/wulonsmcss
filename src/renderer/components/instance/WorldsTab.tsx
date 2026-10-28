import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import type { Instance, WorldPack } from "@/lib/types";

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
