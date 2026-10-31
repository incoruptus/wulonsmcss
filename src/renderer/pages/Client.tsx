import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FolderOpen, Layers, Package, RefreshCw, Save, Server, Sparkles } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import type { DirEntry } from "@/lib/types";
import { CreateServerFromClientDialog } from "@/components/instance/CreateServerFromClientDialog";

/**
 * 我的客户端（玩家模式）
 * ------------------------------------------------------------
 * 玩家的客户端是**他自己的**：可以比服主多装东西（音效、光影、小地图），
 * 只要不改变服务端判定的那部分，进服完全不受影响。
 * 所以这一页不叫"服务器配置"，只回答两件事：我这儿有什么、能不能进。
 */
export default function Client() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profiles = useConfig((s) => s.cfg.clientProfiles);
  const upsert = useConfig((s) => s.upsertClientProfile);

  const [dir, setDir] = useState(searchParams.get("dir") ?? "");
  const [versions, setVersions] = useState<string[]>([]);
  const [mods, setMods] = useState<DirEntry[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  // 默认指向本机 .minecraft：主进程直接给 minecraftDir（网页 agent 也有），
  // 老版本没有这个字段时才退回 appData 的上一层。
  useEffect(() => {
    void window.mcss.app
      .info()
      .then((info) => {
        const fallback = info.appData.replace(/[\\/][^\\/]+$/, "") + "\\.minecraft";
        setDir((d) => d || info.minecraftDir || fallback);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!dir) return;
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  async function scan() {
    setScanning(true);
    try {
      const [vlist, mlist, llist] = await Promise.all([
        window.mcss.fs.list(`${dir}\\versions`).catch(() => [] as DirEntry[]),
        window.mcss.fs.list(`${dir}\\mods`).catch(() => [] as DirEntry[]),
        window.mcss.fs.list(`${dir}\\versions`).catch(() => [] as DirEntry[]),
      ]);
      setVersions(vlist.filter((e) => e.isDir).map((e) => e.name));
      setMods(mlist.filter((e) => !e.isDir && /\.jar$/i.test(e.name)));
      setLoaders(
        llist
          .filter((e) => e.isDir && /^(fabric|forge|neoforge|quilt)/i.test(e.name))
          .map((e) => (/^fabric/i.test(e.name) ? "fabric" : /^neoforge/i.test(e.name) ? "neoforge" : /^forge/i.test(e.name) ? "forge" : "quilt")),
      );
    } finally {
      setScanning(false);
    }
  }

  const uniqueLoaders = [...new Set(loaders)];
  const ready = versions.length > 0;

  async function save() {
    if (!dir) return toast.error("先选一个客户端目录");
    await upsert({
      id: profiles[0]?.id ?? "default-client",
      name: "我的客户端",
      dir,
      mcVersion: versions[0] ?? "",
      loader: (uniqueLoaders[0] as never) ?? "vanilla",
      extraMods: mods.map((m) => ({ file: m.name })),
    });
    toast.success("客户端已保存", { description: "下次加入游戏时，将默认检查此目录。" });
  }

  return (
    <>
      <PageHeader
        className="max-w-6xl"
        title="我的客户端"
        desc="查看本机已安装的游戏版本与模组。音效、光影、小地图等客户端模组可自由添加。"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={scan} loading={scanning}>
              <RefreshCw className="size-4" />
              重新扫描
            </Button>
            <Button onClick={() => setServerOpen(true)} disabled={!ready}>
              <Server className="size-4" />
              用这个客户端开服
            </Button>
          </div>
        }
      />
      <PageBody className="max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background-100 p-3 shadow-geist-border">
          <span className="t-label-13 shrink-0 pl-1 font-medium text-gray-900">客户端目录</span>
          <Input value={dir} onChange={(e) => setDir(e.target.value)} className="h-8 min-w-[280px] flex-1 font-mono text-[12px]" />
          <Button
            variant="secondary"
            onClick={async () => {
              const picked = await window.mcss.dialog.openDirectory();
              if (picked) setDir(picked);
            }}
          >
            选择
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.mcss.app.openPath(dir)}
            disabled={!dir}
            aria-label="打开目录"
          >
            <FolderOpen className="size-4" />
          </Button>
          <Button onClick={save} disabled={!ready}>
            <Save className="size-4" />
            保存
          </Button>
        </div>

        {!ready ? (
          <Card>
            <EmptyState
              icon={<Layers className="size-5" />}
              title="该目录下未找到已安装的游戏版本"
              desc="请指向 .minecraft 目录本身，其中应包含 versions、mods 与 launcher_profiles.json。若使用 PCL 或 HMCL，版本可能存放在其它目录。"
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="t-label-12 text-gray-700">已安装版本</div>
              <div className="t-h-20 mt-1 text-gray-1000">{versions.length}</div>
              <div className="t-label-12 mt-1 truncate text-gray-800">{versions.slice(0, 3).join(" · ") || "—"}</div>
            </Card>
            <Card className="p-4">
              <div className="t-label-12 text-gray-700">客户端 Mod</div>
              <div className="t-h-20 mt-1 text-gray-1000">{mods.length}</div>
              <div className="t-label-12 mt-1 text-gray-800">含自行添加的模组（音效、光影前置等）</div>
            </Card>
            <Card className="p-4">
              <div className="t-label-12 text-gray-700">加载器</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {uniqueLoaders.length ? (
                  uniqueLoaders.map((l) => (
                    <Badge key={l} variant="blue" size="sm">
                      {l}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="gray" size="sm">
                    原版
                  </Badge>
                )}
              </div>
              <div className="t-label-12 mt-2 text-gray-800">按 versions/ 里的加载器目录判断</div>
            </Card>
          </div>
        )}

        {mods.length > 0 ? (
          <Card>
            <CardTitle desc="此处仅展示扫描结果，需要增删时可直接打开 mods 目录。">已安装的客户端模组</CardTitle>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {mods.slice(0, 40).map((m) => (
                <div key={m.path} className="flex items-center gap-2 rounded-lg bg-background-200 px-2.5 py-1.5">
                  <Package className="size-3.5 shrink-0 text-gray-700" />
                  <span className="t-mono-12 truncate text-gray-900">{m.name}</span>
                </div>
              ))}
            </div>
            {mods.length > 40 ? <p className="t-label-12 mt-2 text-gray-700">还有 {mods.length - 40} 个……</p> : null}
          </Card>
        ) : null}

        <Card className="flex items-start gap-3 p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-gray-800" />
          <div className="min-w-0">
            <div className="t-h-14 text-gray-1000">客户端与服务端分别需要安装什么？</div>
            <p className="t-copy-13 mt-1.5 text-gray-800">
              插件装在服务器上，玩家通常不用额外安装；模组服需要准备房间要求的模组。音效、小地图、光影等客户端模组只影响自己的体验，不需要和服主完全一致。
            </p>
            <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => navigate("/")}>
              去加入游戏
            </Button>
          </div>
        </Card>
      </PageBody>
      <CreateServerFromClientDialog open={serverOpen} onOpenChange={setServerOpen} />
    </>
  );
}
