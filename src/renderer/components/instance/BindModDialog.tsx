import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Search } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState, Spinner } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import type { Instance, ModMeta } from "@/lib/types";

interface Hit {
  id: string;
  slug: string;
  title: string;
  description: string;
}

interface Version {
  id: string;
  name: string;
  versionNumber: string;
  files: { filename: string; primary: boolean }[];
}

/**
 * 把本地 Mod 手动绑定到 Modrinth 项目/版本。
 * 绑定后，邀请码与进服包就能带上它，玩家侧可以自动拉齐。
 */
export function BindModDialog({
  open,
  onOpenChange,
  instance,
  mod,
  onBound,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
  mod: ModMeta | null;
  onBound: () => void;
}) {
  const patch = useConfig((s) => s.patch);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [project, setProject] = useState<Hit | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (!open || !mod) return;
    setQuery(mod.name || mod.id);
    setHits([]);
    setProject(null);
    setVersions([]);
  }, [open, mod?.path]);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await window.mcss.modrinth.search(query.trim(), {
        mcVersion: instance.mcVersion,
        loader: instance.loader === "fabric" ? "fabric" : undefined,
        limit: 8,
      });
      setHits(res.hits);
    } catch (e) {
      toast.error(`搜索失败：${(e as Error).message}`);
    } finally {
      setSearching(false);
    }
  }

  async function pickProject(hit: Hit) {
    setProject(hit);
    setLoadingVersions(true);
    try {
      const list = await window.mcss.modrinth.versions(hit.id, {
        mcVersion: instance.mcVersion,
        loader: instance.loader === "fabric" ? "fabric" : undefined,
      });
      setVersions(list as unknown as Version[]);
    } catch (e) {
      toast.error(`读取版本失败：${(e as Error).message}`);
    } finally {
      setLoadingVersions(false);
    }
  }

  async function bind(version: Version) {
    if (!mod || !project) return;
    const cfg = useConfig.getState().cfg;
    await patch({
      modrinthIndex: {
        ...(cfg.modrinthIndex ?? {}),
        [mod.file]: { p: project.id, v: version.id, n: project.title },
      },
    });
    toast.success("已绑定", { description: `${project.title} ${version.versionNumber}` });
    onBound();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-2xl">
      <DialogHeader
        title="绑定到 Modrinth"
        desc={`${mod?.name ?? ""} · ${mod?.file ?? ""}，绑定后玩家侧可按版本自动拉取`}
      />
      <DialogBody className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="搜 Modrinth 项目：名字 / slug / 项目 id"
          />
          <Button onClick={search} loading={searching}>
            <Search className="size-4" />
            搜索
          </Button>
        </div>

        {!project ? (
          hits.length ? (
            <div className="divide-y divide-gray-300 overflow-hidden rounded-lg bg-background-100 shadow-geist-border">
              {hits.map((h) => (
                <button
                  key={h.id}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-100"
                  onClick={() => pickProject(h)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="t-label-13 text-gray-1000">{h.title}</div>
                    <div className="t-mono-12 truncate text-gray-700">{h.slug}</div>
                  </div>
                  <Link2 className="mt-1 size-3.5 shrink-0 text-gray-700" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={searching ? "搜索中…" : "先搜一下"}
              desc="建议直接搜索模组名称；若同名项目较多，可通过 slug 或描述确认。"
              className="py-8"
            />
          )
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">{project.title}</Badge>
              <button className="t-label-12 text-gray-700 underline underline-offset-2" onClick={() => setProject(null)}>
                换一个项目
              </button>
            </div>
            {loadingVersions ? (
              <div className="flex items-center gap-2 py-4 t-label-13 text-gray-700">
                <Spinner /> 读取版本…
              </div>
            ) : versions.length === 0 ? (
              <div className="t-label-12 py-3 text-gray-700">该项目未提供适配当前游戏版本与加载器的文件。</div>
            ) : (
              <div className="max-h-[300px] divide-y divide-gray-300 overflow-y-auto rounded-lg bg-background-100 shadow-geist-border scroll-thin">
                {versions.map((v) => {
                  const same = v.files.some((f) => f.filename === mod?.file);
                  return (
                    <button
                      key={v.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                      onClick={() => bind(v)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="t-label-13 text-gray-1000">{v.versionNumber}</div>
                        <div className="t-mono-12 truncate text-gray-700">{v.files[0]?.filename}</div>
                      </div>
                      {same ? <Badge variant="green" size="sm">文件名一致</Badge> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
