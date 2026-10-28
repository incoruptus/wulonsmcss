import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FolderOpen, GitCompare, Link2, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import type { Instance, ModMeta } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { useConfig } from "@/stores/config";
import { BindModDialog } from "@/components/instance/BindModDialog";

interface DiffRow {
  key: string;
  name: string;
  server?: ModMeta;
  client?: ModMeta;
  status: "same" | "version" | "server-only" | "client-only";
}

const EMPTY_INDEX: Record<string, { p: string; v: string; n?: string }> = {};

export function ModsTab({ instance }: { instance: Instance }) {
  const modsDir = `${instance.dir}\\mods`;
  const [mods, setMods] = useState<ModMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const [clientDir, setClientDir] = useState("");
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const catalog = useConfig((s) => s.cfg.remoteCatalogs?.[instance.id]);
  // 注意：选择器里不能返回新对象（`?? {}`），否则每次渲染引用都变，Zustand 会无限重渲染
  const modrinthIndex = useConfig((s) => s.cfg.modrinthIndex) ?? EMPTY_INDEX;
  const [binding, setBinding] = useState<ModMeta | null>(null);
  const [matching, setMatching] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setMods(await window.mcss.mods.scan(modsDir));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    setDiff(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter((m) => `${m.name} ${m.id} ${m.version}`.toLowerCase().includes(q));
  }, [mods, query]);

  async function pickClient() {
    const dir = await window.mcss.dialog.openDirectory();
    if (dir) setClientDir(dir);
    setDiff(null);
  }

  async function compare(source: "local" | "cloud") {
    if (!clientDir) {
      toast.error("先选客户端 .minecraft 目录");
      return;
    }
    setComparing(true);
    try {
      const clientMods = await window.mcss.mods.scan(`${clientDir}\\mods`);
      const serverList: ModMeta[] =
        source === "local"
          ? mods
          : (catalog?.mods ?? []).map((m) => ({
              file: m.file,
              path: "",
              id: m.id,
              name: m.name,
              version: m.version,
              environment: m.environment,
              size: 0,
              mtime: 0,
            }));
      if (source === "cloud" && serverList.length === 0) {
        toast.error("云端还没有这个实例的 Mod 清单，先在服务器那台机器同步一次");
        return;
      }
      const byId = (list: ModMeta[]) => {
        const map = new Map<string, ModMeta>();
        for (const m of list) map.set(m.id, m);
        return map;
      };
      const s = byId(serverList);
      const c = byId(clientMods);
      const keys = new Set([...s.keys(), ...c.keys()]);
      const rows: DiffRow[] = [];
      for (const key of keys) {
        const sv = s.get(key);
        const cv = c.get(key);
        if (sv && cv) {
          rows.push({
            key,
            name: sv.name || cv.name,
            server: sv,
            client: cv,
            status: sv.version && cv.version && sv.version !== cv.version ? "version" : "same",
          });
        } else if (sv) rows.push({ key, name: sv.name, server: sv, status: "server-only" });
        else if (cv) rows.push({ key, name: cv.name, client: cv, status: "client-only" });
      }
      const order = { version: 0, "server-only": 1, "client-only": 2, same: 3 } as const;
      rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, "zh-CN"));
      setDiff(rows);
    } catch (e) {
      toast.error(`比对失败：${(e as Error).message}`);
    } finally {
      setComparing(false);
    }
  }

  const summary = useMemo(() => {
    if (!diff) return null;
    return {
      same: diff.filter((d) => d.status === "same").length,
      version: diff.filter((d) => d.status === "version").length,
      serverOnly: diff.filter((d) => d.status === "server-only").length,
      clientOnly: diff.filter((d) => d.status === "client-only").length,
    };
  }, [diff]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索已装 Mod…" className="h-8 pl-8 text-[13px]" />
        </div>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={matching}
          onClick={async () => {
            const cfg = useConfig.getState().cfg;
            const index = cfg.modrinthIndex ?? {};
            const missing = mods
              .filter((m) => !index[m.file])
              .map((m) => ({ id: m.id, file: m.file, version: m.version, name: m.name }));
            if (!missing.length) return toast.info("已经全部关联过了");
            setMatching(true);
            try {
              const resolved = await window.mcss.mods.resolveModrinth(missing);
              if (!resolved.length) return toast.warning("一个都没匹配上，可以手动点「绑定」");
              const merged = { ...index };
              for (const r of resolved) merged[r.file] = { p: r.p, v: r.v, n: r.n };
              await useConfig.getState().patch({ modrinthIndex: merged });
              toast.success(`已匹配 ${resolved.length} / ${missing.length} 个`, {
                description: "匹配到的 Mod 会写进邀请码与进服包",
              });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setMatching(false);
            }
          }}
        >
          <Link2 className="size-3.5" />
          自动匹配
        </Button>
        <IconButton label="打开 mods 目录" size="sm" onClick={() => window.mcss.app.openPath(modsDir)}>
          <FolderOpen className="size-3.5" />
        </IconButton>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <GitCompare className="size-4 text-gray-800" />
          <span className="t-label-14 font-medium text-gray-1000">Mod 适格性审查</span>
          <span className="t-label-12 text-gray-700">比对服务端与本机客户端的 mods，找出缺装 / 版本不一致</span>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={clientDir}
              onChange={(e) => setClientDir(e.target.value)}
              placeholder="客户端 .minecraft 目录"
              className="h-8 w-[260px] font-mono text-[12px]"
            />
            <Button variant="secondary" size="sm" onClick={pickClient}>
              选择
            </Button>
            <Button size="sm" onClick={() => compare("local")} loading={comparing} disabled={!clientDir}>
              用本机服务端比对
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => compare("cloud")}
              disabled={!clientDir || !catalog}
              title={catalog ? `云端清单更新于 ${formatDateTime(catalog.fetchedAt)}` : "还没有从云端拉到这个实例的清单"}
            >
              用云端清单比对
            </Button>
          </div>
        </div>

        <div className="mt-2 t-label-12 text-gray-700">
          {catalog ? (
            <>
              云端清单：{catalog.mods.length} 个 Mod · 由另一台设备于 {formatDateTime(catalog.updatedAt)} 同步
              （本机拉取于 {formatDateTime(catalog.fetchedAt)}）
            </>
          ) : (
            "还没有云端清单。在服务器那台机器上打开「设置 → 跨端同步」，同步一次即可；之后这里可以直接拿云端清单和本机客户端对账。"
          )}
        </div>

        {summary ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="green" size="sm">一致 {summary.same}</Badge>
              <Badge variant="amber" size="sm">版本不一致 {summary.version}</Badge>
              <Badge variant="red" size="sm">客户端缺少 {summary.serverOnly}</Badge>
              <Badge variant="gray" size="sm">仅客户端 {summary.clientOnly}</Badge>
            </div>
            <div className="max-h-[46vh] overflow-y-auto rounded-lg bg-background-100 shadow-geist-border scroll-thin">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-background-100">
                  <tr className="border-b border-gray-300">
                    <th className="t-label-12 px-3 py-2 font-medium text-gray-700">Mod</th>
                    <th className="t-label-12 px-3 py-2 font-medium text-gray-700">服务端</th>
                    <th className="t-label-12 px-3 py-2 font-medium text-gray-700">客户端</th>
                    <th className="t-label-12 px-3 py-2 font-medium text-gray-700">结论</th>
                  </tr>
                </thead>
                <tbody>
                  {(diff ?? []).map((row) => (
                    <tr key={row.key} className="border-b border-gray-300/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="t-label-13 text-gray-1000">{row.name}</div>
                        <div className="t-mono-12 text-gray-700">{row.key}</div>
                      </td>
                      <td className="px-3 py-2 t-mono-12 text-gray-900">{row.server?.version || "—"}</td>
                      <td className="px-3 py-2 t-mono-12 text-gray-900">{row.client?.version || "—"}</td>
                      <td className="px-3 py-2">
                        <Verdict status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Card>

      {mods.length === 0 && !loading ? (
        <Card>
          <EmptyState
            title="还没有装 Mod"
            desc="把 jar 放进 mods 目录，或稍后从「资源库」一键安装。"
            action={
              <Button variant="secondary" onClick={() => window.mcss.app.openPath(modsDir)}>
                <FolderOpen className="size-4" />
                打开 mods 目录
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-0">
          <div className="max-h-[52vh] overflow-y-auto scroll-thin">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-background-200">
                <tr className="border-b border-gray-300">
                  <th className="t-label-12 px-3 py-2 font-medium text-gray-700">名称</th>
                  <th className="t-label-12 px-3 py-2 font-medium text-gray-700">版本</th>
                  <th className="t-label-12 px-3 py-2 font-medium text-gray-700">环境</th>
                  <th className="t-label-12 px-3 py-2 font-medium text-gray-700">分发</th>
                  <th className="t-label-12 px-3 py-2 font-medium text-gray-700">大小</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.path} className="border-b border-gray-300/60 last:border-0">
                    <td className="px-3 py-2">
                      <div className="t-label-13 text-gray-1000">{m.name}</div>
                      <div className="t-mono-12 truncate text-gray-700" title={m.file}>{m.file}</div>
                    </td>
                    <td className="px-3 py-2 t-mono-12 text-gray-900">{m.version || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={m.environment === "server" ? "blue" : m.environment === "client" ? "amber" : "gray"} size="sm">
                        {m.environment === "*" ? "双端" : m.environment}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {modrinthIndex[m.file] ? (
                        <Badge variant="green" size="sm" title={modrinthIndex[m.file].n}>
                          可自动分发
                        </Badge>
                      ) : (
                        <Button size="xs" variant="ghost" onClick={() => setBinding(m)}>
                          绑定
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2 t-mono-12 text-gray-700">{formatBytes(m.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="t-label-12 text-gray-700">
        {Object.keys(modrinthIndex).length
          ? `${filtered.filter((m) => modrinthIndex[m.file]).length} / ${filtered.length} 个已关联 Modrinth —— 关联过的 Mod 会写进邀请码与进服包，玩家可自动拉齐。`
          : "还没有关联 Modrinth 的 Mod：从资源库装的会自动关联，手动放进来的可以点「绑定」。"}
      </p>

      <BindModDialog
        open={Boolean(binding)}
        onOpenChange={(v) => !v && setBinding(null)}
        instance={instance}
        mod={binding}
        onBound={() => void load()}
      />
    </div>
  );
}

function Verdict({ status }: { status: DiffRow["status"] }) {
  if (status === "same")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-green-900">
        <CheckCircle2 className="size-3.5" /> 一致
      </span>
    );
  if (status === "version")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-amber-900">
        <AlertTriangle className="size-3.5" /> 版本不同
      </span>
    );
  if (status === "server-only")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-red-900">
        <XCircle className="size-3.5" /> 客户端缺少
      </span>
    );
  return <span className="t-label-12 text-gray-700">仅客户端</span>;
}
