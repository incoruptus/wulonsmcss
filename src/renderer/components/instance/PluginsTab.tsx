import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FolderOpen, PackageSearch, Plug, RefreshCw, Search } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import type { DirEntry, Instance } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

/**
 * 插件页（插件服：Paper / Purpur）
 * ------------------------------------------------------------
 * 插件与 Mod 是两种东西：插件只跑在服务端，玩家用原版客户端就能进。
 * 所以这里不出现"客户端比对""Modrinth 绑定"这些模组专属的东西，
 * 只回答三件事：装了什么、启用没有、从哪装。
 */
export function PluginsTab({ instance }: { instance: Instance }) {
  const pluginsDir = `${instance.dir}\\plugins`;
  const navigate = useNavigate();
  const [files, setFiles] = useState<DirEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await window.mcss.fs.list(pluginsDir).catch(() => [] as DirEntry[]);
      setFiles(list.filter((f) => !f.isDir && /\.jar(\.disabled)?$/i.test(f.name)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, query]);

  async function toggle(file: DirEntry) {
    try {
      if (/\.disabled$/i.test(file.name)) await window.mcss.mods.enable(file.path);
      else await window.mcss.mods.disable(file.path);
      await load();
    } catch (e) {
      toast.error(`操作失败：${(e as Error).message}`);
    }
  }

  const enabled = files.filter((f) => !/\.disabled$/i.test(f.name)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索已装插件…" className="h-8 pl-8 text-[13px]" />
        </div>
        <Badge variant="violet" size="sm">
          <Plug className="size-3" /> 插件
        </Badge>
        <span className="t-label-12 text-gray-700">
          启用 {enabled} / 共 {files.length}
        </span>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
        <Button size="sm" onClick={() => navigate("/library")}>
          <PackageSearch className="size-3.5" />
          去资源库装
        </Button>
        <IconButton label="打开 plugins 目录" size="sm" onClick={() => window.mcss.app.openPath(pluginsDir)}>
          <FolderOpen className="size-3.5" />
        </IconButton>
      </div>

      <p className="t-label-12 text-gray-800">
        插件只跑在服务端，玩家用原版客户端就能进；装完重启服务器生效。
      </p>

      {files.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<Plug className="size-5" />}
            title="还没有装插件"
            desc="地皮保护、传送、经济、权限这些都在「资源库」里，搜到点安装就会落到 plugins/。"
            action={<Button onClick={() => navigate("/library")}>去资源库</Button>}
          />
        </Card>
      ) : (
        <div className="rounded-xl bg-background-100 shadow-geist-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="t-label-12 px-3 py-2 font-medium text-gray-700">插件</th>
                <th className="t-label-12 px-3 py-2 font-medium text-gray-700">大小</th>
                <th className="t-label-12 px-3 py-2 font-medium text-gray-700">状态</th>
                <th className="t-label-12 px-3 py-2 font-medium text-gray-700"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const off = /\.disabled$/i.test(f.name);
                const label = f.name.replace(/\.disabled$/i, "");
                return (
                  <tr key={f.path} className="border-b border-gray-200 last:border-0">
                    <td className="t-mono-12 px-3 py-2 text-gray-1000">{label}</td>
                    <td className="t-mono-12 px-3 py-2 text-gray-800">{formatBytes(f.size)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={off ? "gray" : "green"} size="sm">
                        {off ? "已禁用" : "启用中"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggle(f)}>
                        {off ? "启用" : "禁用"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
