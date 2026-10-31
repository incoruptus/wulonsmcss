import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FolderOpen, GitCompare, Link2, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import type { Instance, ModMeta } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { BindModDialog } from "@/components/instance/BindModDialog";
import { ClientSyncPanel } from "@/components/instance/ClientSyncPanel";
import { syncClientMods } from "@/lib/client-mods";
import { planFromDiff } from "@/lib/server-sync";

interface DiffRow {
  key: string;
  name: string;
  server?: ModMeta;
  client?: ModMeta;
  status: "same" | "version" | "server-only" | "client-only";
}

const EMPTY_INDEX: Record<string, { p: string; v: string; n?: string }> = {};

export function ModsTab({ instance, onBrowse }: { instance: Instance; onBrowse?: () => void }) {
  const modsDir = `${instance.dir}\\mods`;
  const [mods, setMods] = useState<ModMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const savedClientDir = useConfig((s) => s.cfg.clientProfiles[0]?.dir ?? "");
  const [clientDir, setClientDir] = useState(savedClientDir);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const catalog = useConfig((s) => s.cfg.remoteCatalogs?.[instance.id]);
  const serverStatus = useServer((s) => s.status);
  const serverBusy = serverStatus === "running" || serverStatus === "starting" || serverStatus === "stopping";
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
    setSelected(new Set());
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
        toast.error("还没有拿到这台服务器的模组清单，请先在运行服务器的那台电脑上打开「设置 → 跨端同步」同步一次");
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
      setSelected(new Set());
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

  const selectable = (diff ?? []).filter((d) => d.client && (d.status === "client-only" || d.status === "version"));
  const selectedRows = selectable.filter((d) => selected.has(d.key));
  const syncPlan = useMemo(() => planFromDiff(diff ?? []), [diff]);

  function toggleSelected(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function downloadSelected() {
    if (!selectedRows.length) return;
    if (serverBusy) return toast.error("请先停止服务器，再同步模组");
    const clientSide = selectedRows.filter((r) => r.client?.environment === "client");
    if (clientSide.length) {
      const ok = window.confirm(
        `有 ${clientSide.length} 个模组只该装在玩家电脑上，装到服务器可能报错或导致无法启动，仍要继续？`,
      );
      if (!ok) return;
    }
    setSyncing(true);
    try {
      // 版本不一致的旧服务端文件先删掉，避免新旧两个 jar 同时被加载
      for (const row of selectedRows) {
        if (row.status === "version" && row.server?.path) {
          await window.mcss.fs.remove(row.server.path).catch(() => {});
        }
      }
      const res = await syncClientMods(
        instance.dir,
        selectedRows.map((r) => r.client!),
      );
      if (Object.keys(res.index).length) {
        const index = { ...(useConfig.getState().cfg.modrinthIndex ?? {}), ...res.index };
        await useConfig.getState().patch({ modrinthIndex: index });
      }
      const ok = res.downloaded.length + res.copied.length;
      if (ok) {
        toast.success(`已同步 ${ok} 个模组到服务端`, {
          description: [
            res.downloaded.length ? `Modrinth 下载 ${res.downloaded.length}` : "",
            res.copied.length ? `本地复制 ${res.copied.length}` : "",
            res.failed.length ? `失败 ${res.failed.length}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
      if (res.failed.length) {
        toast.error(`${res.failed.length} 个失败`, {
          description: res.failed.map((x) => `${x.file}：${x.error}`).slice(0, 3).join("；"),
        });
      }
      setDiff(null);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索已装模组…" className="h-8 pl-8 text-[13px]" />
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
              if (!resolved.length) return toast.warning("未匹配到任何模组，可手动点击「绑定」");
              const merged = { ...index };
              for (const r of resolved) merged[r.file] = { p: r.p, v: r.v, n: r.n };
              await useConfig.getState().patch({ modrinthIndex: merged });
              toast.success(`已匹配 ${resolved.length} / ${missing.length} 个`, {
                description: "匹配到的模组会写入邀请码与进服包",
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
          <span className="t-label-14 font-medium text-gray-1000">检查模组是否齐全</span>
          <span className="t-label-12 text-gray-700">对比服务器的模组和朋友的客户端，找出缺少或版本不一致的模组</span>
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
              对比本机客户端
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => compare("cloud")}
              disabled={!clientDir || !catalog}
              title={catalog ? `已同步清单更新于 ${formatDateTime(catalog.fetchedAt)}` : "还没有从另一台设备同步到清单"}
            >
              对比已同步清单
            </Button>
          </div>
        </div>

        <div className="mt-2 t-label-12 text-gray-700">
          {catalog ? (
            <>
              已同步清单：{catalog.mods.length} 个模组 · 由另一台设备于 {formatDateTime(catalog.updatedAt)} 同步
              （本机拉取于 {formatDateTime(catalog.fetchedAt)}）
            </>
          ) : (
            "还没有同步过这台服务器的清单。在运行服务器的那台电脑上打开「设置 → 跨端同步」同步一次，之后就能用这份清单和本机客户端对比。"
          )}
        </div>

        {summary ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-200 px-3 py-2">
              <Button
                size="sm"
                onClick={downloadSelected}
                loading={syncing}
                disabled={!selectedRows.length || serverBusy}
                title={serverBusy ? "先停止服务器再同步 Mod" : undefined}
              >
                下载选中的 {selectedRows.length} 个到服务端
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(
                    selectable.every((r) => selected.has(r.key))
                      ? new Set()
                      : new Set(selectable.map((r) => r.key)),
                  )
                }
              >
                {selectable.length && selectable.every((r) => selected.has(r.key)) ? "取消全选" : "全选可下载"}
              </Button>
              <span className="t-label-12 text-gray-700">
                仅选择客户端已有的模组，服务端已有的模组不会重复下载，下载完成后建议重启服务器。
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="green" size="sm">一致 {summary.same}</Badge>
              <Badge variant="amber" size="sm">版本不一致 {summary.version}</Badge>
              <Badge variant="red" size="sm">客户端缺少 {summary.serverOnly}</Badge>
              <Badge variant="gray" size="sm">仅客户端 {summary.clientOnly}</Badge>
            </div>

            <ClientSyncPanel plan={syncPlan} mcDir={clientDir} onSynced={() => void compare("local")} />
            <div className="max-h-[46vh] overflow-auto rounded-lg bg-background-100 shadow-geist-border scroll-thin">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="sticky top-0 bg-background-100">
                  <tr className="border-b border-gray-300">
                    <th className="w-8 px-3 py-2" aria-label="选择" />
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
                        {row.client && (row.status === "client-only" || row.status === "version") ? (
                          <Checkbox
                            checked={selected.has(row.key)}
                            onCheckedChange={(v) => toggleSelected(row.key, v === true)}
                            aria-label={`选择 ${row.name}`}
                          />
                        ) : null}
                      </td>
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
            desc="可将 jar 放入 mods 目录，或在资源库中一键安装，安装时会按游戏版本与加载器自动过滤。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={onBrowse} disabled={!onBrowse}>
                  去资源库
                </Button>
                <Button variant="secondary" onClick={() => window.mcss.app.openPath(modsDir)}>
                  <FolderOpen className="size-4" />
                  打开 mods 目录
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <Card className="p-0">
          <div className="max-h-[52vh] overflow-auto scroll-thin">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-background-100">
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
          ? `${filtered.filter((m) => modrinthIndex[m.file]).length} / ${filtered.length} 个已关联 Modrinth。关联的模组会写入邀请码与进服包，玩家可自动补齐。`
          : "尚无关联 Modrinth 的模组：从资源库安装的会自动关联，手动放入的可点击「绑定」。"}
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
