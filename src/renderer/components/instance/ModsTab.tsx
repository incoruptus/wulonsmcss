import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FolderOpen, GitCompare, Link2, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { useI18n } from "@/i18n";
import type { Instance, ModMeta } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { BindModDialog } from "@/components/instance/BindModDialog";
import { ClientSyncPanel } from "@/components/instance/ClientSyncPanel";
import { syncClientMods } from "@/lib/client-mods";
import { planFromDiff } from "@/lib/server-sync";
import { pickPath } from "@/lib/path-picker";

interface DiffRow {
  key: string;
  name: string;
  server?: ModMeta;
  client?: ModMeta;
  status: "same" | "version" | "server-only" | "client-only";
}

const EMPTY_INDEX: Record<string, { p: string; v: string; n?: string }> = {};

export function ModsTab({ instance, onBrowse }: { instance: Instance; onBrowse?: () => void }) {
  const { t } = useI18n();
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
    const dir = await pickPath({ mode: "dir", title: t("mods.pickClientDir", "选择 .minecraft 目录") });
    if (dir) setClientDir(dir);
    setDiff(null);
    setSelected(new Set());
  }

  async function compare(source: "local" | "cloud") {
    if (!clientDir) {
      toast.error(t("mods.errNoClientDir", "先选客户端 .minecraft 目录"));
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
        toast.error(t("mods.errNoCatalog", "还没有拿到这台服务器的模组清单，请先在运行服务器的那台电脑上打开「设置 → 跨端同步」同步一次"));
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
      toast.error(t("mods.errCompare", "比对失败：{msg}", { msg: (e as Error).message }));
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
    if (serverBusy) return toast.error(t("mods.errStopFirst", "请先停止服务器，再同步模组"));
    const clientSide = selectedRows.filter((r) => r.client?.environment === "client");
    if (clientSide.length) {
      const ok = window.confirm(
        t("mods.confirmClientOnly", "有 {n} 个模组只该装在玩家电脑上，装到服务器可能报错或导致无法启动，仍要继续？", { n: clientSide.length }),
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
        toast.success(t("mods.syncOk", "已同步 {n} 个模组到服务端", { n: ok }), {
          description: [
            res.downloaded.length ? t("mods.syncDownloaded", "Modrinth 下载 {n}", { n: res.downloaded.length }) : "",
            res.copied.length ? t("mods.syncCopied", "本地复制 {n}", { n: res.copied.length }) : "",
            res.failed.length ? t("mods.syncFailed", "失败 {n}", { n: res.failed.length }) : "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
      if (res.failed.length) {
        toast.error(t("mods.failedCount", "{n} 个失败", { n: res.failed.length }), {
          description: res.failed.map((x) => `${x.file}：${x.error}`).slice(0, 3).join("；"),
        });
      }
      setDiff(null);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(t("mods.errSync", "同步失败：{msg}", { msg: (e as Error).message }));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("mods.search.placeholder", "搜索已装模组…")} className="h-8 pl-8 text-[13px]" />
        </div>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="size-3.5" />
          {t("mods.refresh", "刷新")}
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
            if (!missing.length) return toast.info(t("mods.alreadyLinked", "已经全部关联过了"));
            setMatching(true);
            try {
              const resolved = await window.mcss.mods.resolveModrinth(missing);
              if (!resolved.length) return toast.warning(t("mods.matchNone", "未匹配到任何模组，可手动点击「绑定」"));
              const merged = { ...index };
              for (const r of resolved) merged[r.file] = { p: r.p, v: r.v, n: r.n };
              await useConfig.getState().patch({ modrinthIndex: merged });
              toast.success(t("mods.matchOk", "已匹配 {done} / {total} 个", { done: resolved.length, total: missing.length }), {
                description: t("mods.matchOkDesc", "匹配到的模组会写入邀请码与进服包"),
              });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setMatching(false);
            }
          }}
        >
          <Link2 className="size-3.5" />
          {t("mods.autoMatch", "自动匹配")}
        </Button>
        <IconButton label={t("mods.openDir", "打开 mods 目录")} size="sm" onClick={() => window.mcss.app.openPath(modsDir)}>
          <FolderOpen className="size-3.5" />
        </IconButton>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <GitCompare className="size-4 text-gray-800" />
          <span className="t-label-14 font-medium text-gray-1000">{t("mods.check.title", "检查模组是否齐全")}</span>
          <span className="t-label-12 text-gray-700">{t("mods.check.desc", "对比服务器的模组和朋友的客户端，找出缺少或版本不一致的模组")}</span>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={clientDir}
              onChange={(e) => setClientDir(e.target.value)}
              placeholder={t("mods.clientDir.placeholder", "客户端 .minecraft 目录")}
              className="h-8 w-[260px] font-mono text-[12px]"
            />
            <Button variant="secondary" size="sm" onClick={pickClient}>
              {t("mods.choose", "选择")}
            </Button>
            <Button size="sm" onClick={() => compare("local")} loading={comparing} disabled={!clientDir}>
              {t("mods.compareLocal", "对比本机客户端")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => compare("cloud")}
              disabled={!clientDir || !catalog}
              title={catalog ? t("mods.cloudHint.updated", "已同步清单更新于 {time}", { time: formatDateTime(catalog.fetchedAt) }) : t("mods.cloudHint.none", "还没有从另一台设备同步到清单")}
            >
              {t("mods.compareCloud", "对比已同步清单")}
            </Button>
          </div>
        </div>

        <div className="mt-2 t-label-12 text-gray-700">
          {catalog ? (
            <>
              {t("mods.syncedSummary", "已同步清单：{n} 个模组 · 由另一台设备于 {updated} 同步（本机拉取于 {fetched}）", { n: catalog.mods.length, updated: formatDateTime(catalog.updatedAt), fetched: formatDateTime(catalog.fetchedAt) })}
            </>
          ) : (
            t("mods.syncedNone", "还没有同步过这台服务器的清单。在运行服务器的那台电脑上打开「设置 → 跨端同步」同步一次，之后就能用这份清单和本机客户端对比。")
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
                title={serverBusy ? t("mods.stopFirst", "先停止服务器再同步 Mod") : undefined}
              >
                {t("mods.downloadSelected", "下载选中的 {n} 个到服务端", { n: selectedRows.length })}
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
                {selectable.length && selectable.every((r) => selected.has(r.key)) ? t("mods.unselectAll", "取消全选") : t("mods.selectAll", "全选可下载")}
              </Button>
              <span className="t-label-12 text-gray-700">
                {t("mods.selectHint", "仅选择客户端已有的模组，服务端已有的模组不会重复下载，下载完成后建议重启服务器。")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="green" size="sm">{t("mods.badge.same", "一致 {n}", { n: summary.same })}</Badge>
              <Badge variant="amber" size="sm">{t("mods.badge.version", "版本不一致 {n}", { n: summary.version })}</Badge>
              <Badge variant="red" size="sm">{t("mods.badge.serverOnly", "客户端缺少 {n}", { n: summary.serverOnly })}</Badge>
              <Badge variant="gray" size="sm">{t("mods.badge.clientOnly", "仅客户端 {n}", { n: summary.clientOnly })}</Badge>
            </div>

            <ClientSyncPanel plan={syncPlan} mcDir={clientDir} onSynced={() => void compare("local")} />
            <div className="max-h-[46vh] overflow-auto rounded-lg bg-background-100 shadow-geist-border scroll-thin">
              <table className="data-table min-w-[680px]">
                <thead className="sticky top-0 bg-background-200">
                  <tr>
                    <th className="w-8 px-3 py-2" aria-label={t("mods.col.select", "选择")} />
                    <th>Mod</th>
                    <th>{t("mods.col.server", "服务端")}</th>
                    <th>{t("mods.col.client", "客户端")}</th>
                    <th>{t("mods.col.verdict", "结论")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(diff ?? []).map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.client && (row.status === "client-only" || row.status === "version") ? (
                          <Checkbox
                            checked={selected.has(row.key)}
                            onCheckedChange={(v) => toggleSelected(row.key, v === true)}
                            aria-label={t("mods.selectRow", "选择 {name}", { name: row.name })}
                          />
                        ) : null}
                      </td>
                      <td>
                        <div className="t-label-13 text-gray-1000">{row.name}</div>
                        <div className="t-mono-12 text-gray-700">{row.key}</div>
                      </td>
                      <td className="t-mono-12 text-gray-900">{row.server?.version || "—"}</td>
                      <td className="t-mono-12 text-gray-900">{row.client?.version || "—"}</td>
                      <td>
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
            title={t("mods.empty.title", "还没有装 Mod")}
            desc={t("mods.empty.desc", "可将 jar 放入 mods 目录，或在资源库中一键安装，安装时会按游戏版本与加载器自动过滤。")}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={onBrowse} disabled={!onBrowse}>
                  {t("mods.goLibrary", "去资源库")}
                </Button>
                <Button variant="secondary" onClick={() => window.mcss.app.openPath(modsDir)}>
                  <FolderOpen className="size-4" />
                  {t("mods.openDir", "打开 mods 目录")}
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <Card className="p-0">
          <div className="max-h-[52vh] overflow-auto scroll-thin">
            <table className="data-table min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-background-200">
                <tr>
                  <th>{t("mods.col.name", "名称")}</th>
                  <th>{t("mods.col.version", "版本")}</th>
                  <th>{t("mods.col.env", "环境")}</th>
                  <th>{t("mods.col.dist", "分发")}</th>
                  <th>{t("mods.col.size", "大小")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.path}>
                    <td>
                      <div className="t-label-13 text-gray-1000">{m.name}</div>
                      <div className="t-mono-12 truncate text-gray-700" title={m.file}>{m.file}</div>
                    </td>
                    <td className="t-mono-12 text-gray-900">{m.version || "—"}</td>
                    <td>
                      <Badge variant={m.environment === "server" ? "blue" : m.environment === "client" ? "amber" : "gray"} size="sm">
                        {m.environment === "*" ? t("mods.env.both", "双端") : m.environment}
                      </Badge>
                    </td>
                    <td>
                      {modrinthIndex[m.file] ? (
                        <Badge variant="green" size="sm" title={modrinthIndex[m.file].n}>
                          {t("mods.autoDist", "可自动分发")}
                        </Badge>
                      ) : (
                        <Button size="xs" variant="ghost" onClick={() => setBinding(m)}>
                          {t("mods.bind", "绑定")}
                        </Button>
                      )}
                    </td>
                    <td className="t-mono-12 text-gray-700">{formatBytes(m.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="t-label-12 text-gray-700">
        {Object.keys(modrinthIndex).length
          ? t("mods.linkedCount", "{linked} / {total} 个已关联 Modrinth。关联的模组会写入邀请码与进服包，玩家可自动补齐。", { linked: filtered.filter((m) => modrinthIndex[m.file]).length, total: filtered.length })
          : t("mods.noneLinked", "尚无关联 Modrinth 的模组：从资源库安装的会自动关联，手动放入的可点击「绑定」。")}
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
  const { t } = useI18n();
  if (status === "same")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-green-900">
        <CheckCircle2 className="size-3.5" /> {t("mods.verdict.same", "一致")}
      </span>
    );
  if (status === "version")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-amber-900">
        <AlertTriangle className="size-3.5" /> {t("mods.verdict.version", "版本不同")}
      </span>
    );
  if (status === "server-only")
    return (
      <span className="inline-flex items-center gap-1 t-label-12 text-red-900">
        <XCircle className="size-3.5" /> {t("mods.verdict.serverOnly", "客户端缺少")}
      </span>
    );
  return <span className="t-label-12 text-gray-700">{t("mods.verdict.clientOnly", "仅客户端")}</span>;
}
