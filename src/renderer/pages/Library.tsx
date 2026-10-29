import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Download, PackageSearch, Plug, RefreshCw, Search } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { formatBytes } from "@/lib/utils";
import { contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import type { Instance } from "@/lib/types";

interface Hit {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads: number;
  author?: string;
  categories: string[];
}

/**
 * 资源库：**永远对着一个具体实例装**
 * ------------------------------------------------------------
 * 以前这里是"全局资源库"，安装时不问装到哪、装完也不回写状态，
 * 于是出现"装完不知道装哪去了"。现在：
 *   1. 顶部固定「安装到 [实例]」，默认当前实例，可切
 *   2. 搜索按这个实例的版本 + 核心类型过滤（插件服查 plugin，模组服查 mod）
 *   3. 装过的直接标「已装」，并把 jar 落到这个实例的 plugins/ 或 mods/
 */
export default function Library() {
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const patch = useConfig((s) => s.patch);
  const modrinthIndex = useConfig((s) => s.cfg.modrinthIndex);

  const [targetId, setTargetId] = useState<string>(activeId ?? instances[0]?.id ?? "");
  const target: Instance | undefined = useMemo(
    () => instances.find((i) => i.id === targetId) ?? instances.find((i) => i.id === activeId) ?? instances[0],
    [instances, targetId, activeId],
  );

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);

  const serverType = target ? serverTypeOf(target) : "fabric";
  const kind = contentKindOf(serverType);
  const isPlugin = kind === "plugin";
  /** 内容目录：插件服是 plugins/，模组服是 mods/ */
  const contentDir = target ? `${target.dir}\\${isPlugin ? "plugins" : "mods"}` : "";
  /** 搜索时用的 loader 过滤：插件统一按 paper 查（Purpur 兼容 Paper 插件） */
  const searchLoader = isPlugin ? "paper" : serverType === "fabric" || serverType === "forge" || serverType === "neoforge" ? serverType : undefined;

  async function refreshInstalled() {
    if (!target) return;
    const list = await window.mcss.fs.list(contentDir).catch(() => []);
    setInstalled(list.filter((e) => !e.isDir && /\.jar(\.disabled)?$/i.test(e.name)).map((e) => e.name));
  }

  async function search(reset = true) {
    if (!target) return;
    setLoading(true);
    try {
      const res = await window.mcss.modrinth.search(query, {
        mcVersion: target.mcVersion,
        loader: searchLoader,
        projectType: isPlugin ? "plugin" : "mod",
        limit: 24,
        offset: reset ? 0 : hits.length,
        sort,
      });
      setHits(reset ? res.hits : [...hits, ...res.hits]);
      setTotal(res.total);
    } catch (e) {
      toast.error(`搜索失败：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!target) return;
    void refreshInstalled();
    void search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, sort, isPlugin]);

  /** 已经装在这个实例里的 Modrinth 项目 id（靠安装时写下的索引判断） */
  const installedProjects = useMemo(() => {
    const index = modrinthIndex ?? {};
    const set = new Set<string>();
    for (const [file, ref] of Object.entries(index)) {
      if (installed.includes(file)) set.add(ref.p);
    }
    return set;
  }, [modrinthIndex, installed]);

  async function install(hit: Hit) {
    if (!target) return;
    setInstalling(hit.id);
    try {
      const versions = await window.mcss.modrinth.versions(hit.id, {
        mcVersion: target.mcVersion,
        loader: searchLoader,
      });
      const v = versions[0];
      const file = v?.files.find((f) => f.primary) ?? v?.files[0];
      if (!file) {
        toast.error("这个项目没有适配当前版本的文件");
        return;
      }
      const res = await window.mcss.modrinth.install({
        dir: target.dir,
        fileUrl: file.url,
        fileName: file.filename,
        kind: isPlugin ? "plugin" : "mod",
      });
      if (!res.ok) throw new Error(res.error || "安装失败");
      // 记下索引：房间码/进服包要用，也是「已装」状态的依据
      await patch({
        modrinthIndex: {
          ...(useConfig.getState().cfg.modrinthIndex ?? {}),
          [file.filename]: { p: hit.id, v: v.id, n: hit.title },
        },
      });
      await refreshInstalled();
      toast.success(isPlugin ? "插件已安装" : "Mod 已安装", {
        description: `${hit.title} ${v.versionNumber} · ${formatBytes(file.size)} → ${isPlugin ? "plugins/" : "mods/"}`,
      });
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`);
    } finally {
      setInstalling(null);
    }
  }

  if (!target) {
    return (
      <>
        <PageHeader title="资源库" desc="先有一个服务器实例，资源库才知道该装到哪里。" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<PackageSearch className="size-5" />}
              title="还没有服务器实例"
              desc="资源库是「对着某个实例」安装的：按它的版本和核心类型过滤，装进它的 plugins/ 或 mods/。"
              action={<Button onClick={() => navigate("/")}>去新建一个</Button>}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const kindLabel = isPlugin ? "插件" : kind === "datapack" ? "数据包" : "模组";

  return (
    <>
      <PageHeader
        title="资源库"
        desc={`安装到 ${target.name} · ${target.mcVersion} · ${serverTypeLabel(serverType)}`}
        actions={
          <Badge variant="gray" size="md">
            {total.toLocaleString()} 个结果
          </Badge>
        }
      />
      <PageBody className="space-y-4">
        {/* 安装目标：这一行就是"装到哪"的答案 */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background-100 p-2.5 shadow-geist-border">
          <span className="t-label-12 shrink-0 pl-1 text-gray-700">安装到</span>
          <Select
            className="w-[240px]"
            value={target.id}
            onChange={(e) => setTargetId(e.target.value)}
            options={instances.map((i) => ({
              value: i.id,
              label: `${i.name}（${i.mcVersion} · ${serverTypeLabel(serverTypeOf(i))}）`,
            }))}
          />
          <Badge variant={isPlugin ? "violet" : "blue"} size="sm">
            {isPlugin ? <Plug className="size-3" /> : <PackageSearch className="size-3" />}
            {kindLabel}
          </Badge>
          <span className="t-mono-12 truncate text-gray-700">
            → {isPlugin ? "plugins" : "mods"}/ · 已装 {installed.length}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void window.mcss.app.openPath(contentDir)}>
            打开目录
          </Button>
        </div>

        {kind === "datapack" ? (
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="t-label-14 text-gray-1000">原版服务端不能装插件或模组</div>
              <p className="t-label-12 mt-0.5 text-gray-800">
                想要插件（地皮、传送、经济），把核心换成 Paper：玩家仍然用原版客户端就能进。
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate("/")}>
              换 Paper
            </Button>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-700" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(true)}
              placeholder={isPlugin ? `搜索插件，例如 EssentialsX / 地皮 / 领地` : "搜索 Mod，例如 sodium / 优化 / 地图"}
              className="pl-9"
            />
          </div>
          <Select
            className="w-[160px]"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={[
              { value: "relevance", label: "相关度" },
              { value: "downloads", label: "下载量" },
              { value: "newest", label: "最新" },
              { value: "updated", label: "最近更新" },
            ]}
          />
          <Button onClick={() => search(true)} loading={loading}>
            <RefreshCw className="size-4" />
            搜索
          </Button>
        </div>

        {loading && hits.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : hits.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PackageSearch className="size-5" />}
              title="没有结果"
              desc={`换个关键词，或者确认 ${target.mcVersion} 有这个${kindLabel}。`}
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {hits.map((hit) => {
              const done = installedProjects.has(hit.id);
              return (
                <Card key={hit.id} className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-start gap-3">
                    {hit.iconUrl ? (
                      <img src={hit.iconUrl} alt="" className="size-10 rounded-lg object-cover" />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-lg bg-gray-200">
                        <PackageSearch className="size-5 text-gray-700" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="t-h-14 truncate text-gray-1000">{hit.title}</div>
                      <div className="t-label-12 text-gray-700">
                        {hit.author ? `${hit.author} · ` : ""}
                        {hit.downloads.toLocaleString()} 次下载
                      </div>
                    </div>
                    {done ? (
                      <Badge variant="green" size="sm">
                        <Check className="size-3" /> 已装
                      </Badge>
                    ) : null}
                  </div>
                  <p className="t-label-12 line-clamp-2 min-h-[32px] text-gray-800">{hit.description}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex gap-1">
                      {hit.categories.slice(0, 2).map((c) => (
                        <Badge key={c} variant="gray" size="sm">
                          {c}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant={done ? "secondary" : "default"}
                      onClick={() => install(hit)}
                      loading={installing === hit.id}
                    >
                      {done ? <RefreshCw className="size-3.5" /> : <Download className="size-3.5" />}
                      {done ? "重装" : "安装"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {hits.length > 0 && hits.length < total ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => search(false)} loading={loading}>
              加载更多
            </Button>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
