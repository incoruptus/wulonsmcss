import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FolderOpen, GitCompare, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import type { Instance, ModMeta } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

interface DiffRow {
  key: string;
  name: string;
  server?: ModMeta;
  client?: ModMeta;
  status: "same" | "version" | "server-only" | "client-only";
}

export function ModsTab({ instance }: { instance: Instance }) {
  const modsDir = `${instance.dir}\\mods`;
  const [mods, setMods] = useState<ModMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const [clientDir, setClientDir] = useState("");
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [comparing, setComparing] = useState(false);

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

  async function compare() {
    if (!clientDir) {
      toast.error("先选客户端 .minecraft 目录");
      return;
    }
    setComparing(true);
    try {
      const clientMods = await window.mcss.mods.scan(`${clientDir}\\mods`);
      const byId = (list: ModMeta[]) => {
        const map = new Map<string, ModMeta>();
        for (const m of list) map.set(m.id, m);
        return map;
      };
      const s = byId(mods);
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
            <Button size="sm" onClick={compare} loading={comparing} disabled={!clientDir}>
              开始比对
            </Button>
          </div>
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
                    <td className="px-3 py-2 t-mono-12 text-gray-700">{formatBytes(m.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
