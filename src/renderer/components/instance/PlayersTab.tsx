import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  ClipboardPaste,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useServer } from "@/stores/server";
import type { Instance } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number;
  reason?: string;
  created?: string;
}

const EMPTY: PlayerEntry[] = [];

export function PlayersTab({ instance }: { instance: Instance }) {
  const players = useServer((s) => s.players);
  const playersJoinedAt = useServer((s) => s.playersJoinedAt);
  const status = useServer((s) => s.status);
  const running = status === "running";

  const [ops, setOps] = useState<PlayerEntry[]>(EMPTY);
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>(EMPTY);
  const [banned, setBanned] = useState<PlayerEntry[]>(EMPTY);
  const [bannedIps, setBannedIps] = useState<PlayerEntry[]>(EMPTY);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);

  async function load() {
    const read = async (file: string): Promise<PlayerEntry[]> => {
      try {
        const raw = await window.mcss.fs.read(`${instance.dir}\\${file}`);
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    };
    const [o, w, b, bi] = await Promise.all([
      read("ops.json"),
      read("whitelist.json"),
      read("banned-players.json"),
      read("banned-ips.json"),
    ]);
    setOps(o);
    setWhitelist(w);
    setBanned(b);
    setBannedIps(bi);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  async function run(cmd: string, success: string) {
    if (!running) {
      toast.error("服务器未运行，请先启动后再操作");
      return false;
    }
    const ok = await window.mcss.server.command(cmd).catch(() => false);
    if (!ok) {
      toast.error("指令发送失败");
      return false;
    }
    toast.success(success);
    setTimeout(() => void load(), 900);
    return true;
  }

  const q = search.trim().toLowerCase();
  const filter = (list: PlayerEntry[]) => (q ? list.filter((p) => p.name?.toLowerCase().includes(q)) : list);
  const onlineMatched = filter(players.map((p) => ({ name: p })));
  const whitelistMatched = filter(whitelist);
  const opsMatched = filter(ops);

  const isOp = (n: string) => ops.some((o) => o.name === n);
  const inWhitelist = (n: string) => whitelist.some((w) => w.name === n);

  const summary = useMemo(
    () => ({ online: players.length, white: whitelist.length, ops: ops.length, banned: banned.length + bannedIps.length }),
    [players.length, whitelist.length, ops.length, banned.length, bannedIps.length],
  );

  async function batchAdd() {
    const names = batchText
      .split(/[\s,，、\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return toast.error("请先粘贴玩家名，每行一个或用逗号分隔");
    setBatchBusy(true);
    let ok = 0;
    for (const n of names) {
      const sent = await window.mcss.server.command(`whitelist add ${n}`).catch(() => false);
      if (sent) ok += 1;
      await new Promise((r) => setTimeout(r, 120));
    }
    setBatchBusy(false);
    setBatchOpen(false);
    setBatchText("");
    toast.success(`已提交 ${ok} / ${names.length} 个名字`);
    setTimeout(() => void load(), 900);
  }

  return (
    <div className="space-y-4">
      {/* 顶部工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索玩家…" className="h-8 pl-8 text-[13px]" />
        </div>
        <div className="flex gap-1.5 t-label-12 text-gray-700">
          <Badge variant={summary.online ? "green" : "gray"} size="sm">在线 {summary.online}</Badge>
          <Badge variant="gray" size="sm">白名单 {summary.white}</Badge>
          <Badge variant="gray" size="sm">OP {summary.ops}</Badge>
          {summary.banned ? <Badge variant="red" size="sm">封禁 {summary.banned}</Badge> : null}
        </div>
        <IconButton label="刷新" size="sm" onClick={load}>
          <RefreshCw className="size-3.5" />
        </IconButton>
      </div>

      {/* 快捷操作条 */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <UserPlus className="size-4 text-gray-800" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="玩家名（正版 ID）"
            className="h-8 w-[220px] text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) void run(`whitelist add ${name.trim()}`, `已把 ${name.trim()} 加入白名单`);
            }}
          />
          <Button size="sm" onClick={() => name.trim() && run(`whitelist add ${name.trim()}`, `已把 ${name.trim()} 加入白名单`)}>
            加白名单
          </Button>
          <Button variant="secondary" size="sm" onClick={() => name.trim() && run(`op ${name.trim()}`, `已把 ${name.trim()} 设为 OP`)}>
            <Shield className="size-3.5" />
            设为 OP
          </Button>
          <Button variant="secondary" size="sm" className="hover:text-red-900" onClick={() => name.trim() && run(`ban ${name.trim()}`, `已封禁 ${name.trim()}`)}>
            <Ban className="size-3.5" />
            封禁
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setBatchOpen(true)}>
            <ClipboardPaste className="size-3.5" />
            批量导入白名单
          </Button>
        </div>
      </Card>

      {/* 在线 */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <Users className="size-4 text-gray-800" />
          <h3 className="t-h-14 text-gray-1000">在线玩家</h3>
          <Badge variant={players.length ? "green" : "gray"} size="sm">{players.length}</Badge>
        </div>
        {players.length === 0 ? (
          <EmptyState
            title={running ? "还没有人进来" : "服务器未运行"}
            desc={running ? `发送地址，或先在「联机」页配置一条隧道` : "启动服务器后，这里会列出在线玩家"}
            className="py-6"
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {onlineMatched.map(({ name: p }) => (
              <div key={p} className="flex items-center gap-2 rounded-lg bg-background-100 p-2.5 shadow-geist-border">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-green-800/15 text-[12px] font-semibold text-green-900">
                  {p.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="t-label-13 truncate text-gray-1000">{p}</span>
                    {isOp(p) ? <Badge variant="blue" size="sm">OP</Badge> : null}
                  </div>
                  <div className="t-label-12 text-gray-700">
                    {playersJoinedAt[p] ? `${timeAgo(playersJoinedAt[p])}加入` : "在线"}
                  </div>
                </div>
                <Button variant="ghost" size="xs" onClick={() => run(`kick ${p}`, `已踢出 ${p}`)} title="踢出">
                  <UserMinus className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 白名单 */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">白名单</h3>
            <Badge variant="gray" size="sm">{whitelist.length}</Badge>
          </div>
          {whitelist.length === 0 ? (
            <div className="t-label-12 py-4 text-gray-700">
              白名单为空。开启白名单前记得在「配置」里把 <span className="t-mono-12">white-list</span> 打开。
            </div>
          ) : (
            <div className="max-h-[240px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
              {whitelistMatched.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5">
                  <span className="t-label-13 text-gray-1000">{p.name}</span>
                  <div className="flex items-center gap-1">
                    {isOp(p.name) ? <Badge variant="blue" size="sm">OP</Badge> : null}
                    <Button variant="ghost" size="xs" className="hover:text-red-900" onClick={() => run(`whitelist remove ${p.name}`, `已移除 ${p.name}`)}>
                      移除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* OP */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">管理员（OP）</h3>
            <Badge variant="gray" size="sm">{ops.length}</Badge>
          </div>
          {ops.length === 0 ? (
            <div className="t-label-12 py-4 text-gray-700">尚未设置管理员（OP）。将自己设为 OP 后才能在游戏内使用指令。</div>
          ) : (
            <div className="max-h-[240px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
              {opsMatched.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5">
                  <span className="t-label-13 text-gray-1000">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="t-label-12 text-gray-700">等级 {p.level ?? 4}</span>
                    <Button variant="ghost" size="xs" onClick={() => run(`deop ${p.name}`, `已取消 ${p.name} 的 OP`)}>
                      <ShieldOff className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 封禁 */}
      {banned.length + bannedIps.length > 0 ? (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Ban className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">封禁名单</h3>
            <Badge variant="red" size="sm">{banned.length + bannedIps.length}</Badge>
          </div>
          <div className="divide-y divide-gray-300">
            {banned.map((p) => (
              <div key={`n-${p.name}`} className="flex items-center justify-between py-1.5">
                <div className="min-w-0">
                  <span className="t-label-13 text-gray-1000">{p.name}</span>
                  {p.reason ? <span className="t-label-12 ml-2 text-gray-700">{p.reason}</span> : null}
                </div>
                <Button variant="ghost" size="xs" onClick={() => run(`pardon ${p.name}`, `已解封 ${p.name}`)}>
                  解封
                </Button>
              </div>
            ))}
            {bannedIps.map((p) => (
              <div key={`ip-${p.name}`} className="flex items-center justify-between py-1.5">
                <span className="t-mono-12 text-gray-1000">{p.name}</span>
                <Button variant="ghost" size="xs" onClick={() => run(`pardon-ip ${p.name}`, `已解封 IP`)}>
                  解封
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="t-label-12 text-gray-700">
        操作通过服务器指令完成，需要服务器处于运行状态；白名单与 OP 的改动会即时写回 JSON 文件。
      </p>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen} widthClass="max-w-md">
        <DialogHeader title="批量导入白名单" desc="每行一个玩家名，也支持用逗号或空格分隔。" />
        <DialogBody className="space-y-2">
          <Textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={8}
            placeholder={"Steve\nAlex\nNotch"}
            className="font-mono text-[12.5px]"
          />
          <p className="t-label-12 text-gray-700">将逐条执行 whitelist add 指令，需要服务器处于运行状态。</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setBatchOpen(false)}>取消</Button>
          <Button onClick={batchAdd} loading={batchBusy}>
            <CheckCircle2 className="size-4" />
            导入
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
