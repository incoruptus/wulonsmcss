import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, PackageSearch, Search, RefreshCw } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { formatBytes } from "@/lib/utils";

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

export default function Library() {
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const patch = useConfig((s) => s.patch);
  const active = useMemo(() => instances.find((i) => i.id === activeId) ?? instances[0], [instances, activeId]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  async function search(reset = true) {
    if (!active) return;
    setLoading(true);
    try {
      const res = await window.mcss.modrinth.search(query, {
        mcVersion: active.mcVersion,
        loader: active.loader === "fabric" ? "fabric" : undefined,
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
    if (active) void search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, sort]);

  async function install(hit: Hit) {
    if (!active) return;
    setInstalling(hit.id);
    try {
      const versions = await window.mcss.modrinth.versions(hit.id, {
        mcVersion: active.mcVersion,
        loader: active.loader === "fabric" ? "fabric" : undefined,
      });
      const v = versions[0];
      const file = v?.files.find((f) => f.primary) ?? v?.files[0];
      if (!file) {
        toast.error("这个 Mod 没有适配当前版本的文件");
        return;
      }
      const res = await window.mcss.modrinth.install({
        dir: active.dir,
        fileUrl: file.url,
        fileName: file.filename,
      });
      if (!res.ok) throw new Error(res.error || "安装失败");
      // 记下 Modrinth 索引，房间码才能带上「需要哪些 Mod」
      await patch({
        modrinthIndex: {
          ...(useConfig.getState().cfg.modrinthIndex ?? {}),
          [file.filename]: { p: hit.id, v: v.id, n: hit.title },
        },
      });
      toast.success("已安装", { description: `${hit.title} ${v.versionNumber} · ${formatBytes(file.size)}` });
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`);
    } finally {
      setInstalling(null);
    }
  }

  if (!active) {
    return (
      <>
        <PageHeader title="资源库" desc="从 Modrinth 一键安装 Mod。" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<PackageSearch className="size-5" />}
              title="先创建一个服务器实例"
              desc="资源库会按实例的 Minecraft 版本与加载器过滤，避免装错版本。"
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="资源库"
        desc={`按当前实例过滤：${active.name} · ${active.mcVersion} · ${active.loader}`}
        actions={
          <Badge variant="gray" size="md">
            {total.toLocaleString()} 个结果
          </Badge>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-700" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(true)}
              placeholder="搜索 Mod，例如 sodium / 优化 / 地图"
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
            <EmptyState icon={<PackageSearch className="size-5" />} title="没有结果" desc="换个关键词试试，或确认实例的版本/加载器。" />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {hits.map((hit) => (
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
                  <Button size="sm" onClick={() => install(hit)} loading={installing === hit.id}>
                    <Download className="size-3.5" />
                    安装
                  </Button>
                </div>
              </Card>
            ))}
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
