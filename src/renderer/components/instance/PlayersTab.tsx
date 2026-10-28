import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Shield, UserMinus, UserPlus } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { useServer } from "@/stores/server";
import type { Instance } from "@/lib/types";

interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number;
}

export function PlayersTab({ instance }: { instance: Instance }) {
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [name, setName] = useState("");
  const online = useServer((s) => s.players);
  const status = useServer((s) => s.status);
  const running = status === "running";

  async function load() {
    const read = async (file: string): Promise<PlayerEntry[]> => {
      try {
        const raw = await window.mcss.fs.read(`${instance.dir}\\${file}`);
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list.map((p: any) => ({ uuid: p.uuid, name: p.name, level: p.level })) : [];
      } catch (e) {
        return [];
      }
    };
    const [o, w] = await Promise.all([read("ops.json"), read("whitelist.json")]);
    setOps(o);
    setWhitelist(w);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  async function run(cmd: string, success: string) {
    if (!running) {
      toast.error("服务器没在运行，先启动再操作");
      return;
    }
    const ok = await window.mcss.server.command(cmd).catch(() => false);
    if (!ok) toast.error("指令发送失败");
    else toast.success(success);
    // 给服务器一点时间落盘
    setTimeout(() => void load(), 800);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="玩家名（正版 ID）"
            className="h-8 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) void run(`op ${name.trim()}`, `已把 ${name.trim()} 设为 OP`);
            }}
          />
        </div>
        <Button size="sm" onClick={() => name.trim() && run(`op ${name.trim()}`, `已把 ${name.trim()} 设为 OP`)}>
          <Shield className="size-3.5" />
          设为 OP
        </Button>
        <Button variant="secondary" size="sm" onClick={() => name.trim() && run(`whitelist add ${name.trim()}`, `已把 ${name.trim()} 加入白名单`)}>
          <UserPlus className="size-3.5" />
          加白名单
        </Button>
        <IconButton label="刷新" size="sm" onClick={load}>
          <RefreshCw className="size-3.5" />
        </IconButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">管理员（OP）</h3>
            <Badge variant="gray" size="sm">{ops.length}</Badge>
          </div>
          {ops.length === 0 ? (
            <div className="t-label-12 py-4 text-gray-700">还没有 OP。把自己设成 OP 才能用游戏内指令。</div>
          ) : (
            <div className="divide-y divide-gray-300">
              {ops.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5">
                  <span className="t-label-13 text-gray-1000">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="t-label-12 text-gray-700">等级 {p.level ?? 4}</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => run(`deop ${p.name}`, `已取消 ${p.name} 的 OP`)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">白名单</h3>
            <Badge variant="gray" size="sm">{whitelist.length}</Badge>
          </div>
          {whitelist.length === 0 ? (
            <div className="t-label-12 py-4 text-gray-700">
              白名单为空。记得在「配置」里把 <span className="t-mono-12">white-list</span> 打开。
            </div>
          ) : (
            <div className="divide-y divide-gray-300">
              {whitelist.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5">
                  <span className="t-label-13 text-gray-1000">{p.name}</span>
                  <Button variant="ghost" size="xs" onClick={() => run(`whitelist remove ${p.name}`, `已移除 ${p.name}`)}>
                    移除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="t-h-14 text-gray-1000">在线玩家</h3>
          <Badge variant={online.length ? "green" : "gray"} size="sm">{online.length}</Badge>
        </div>
        {online.length === 0 ? (
          <EmptyState title={running ? "还没有人进来" : "服务器未运行"} desc={running ? "把地址发给朋友就能加入" : "启动后这里会显示在线玩家"} className="py-6" />
        ) : (
          <div className="divide-y divide-gray-300">
            {online.map((p) => (
              <div key={p} className="flex items-center justify-between py-1.5">
                <span className="t-label-13 text-gray-1000">{p}</span>
                <Button variant="ghost" size="xs" onClick={() => run(`kick ${p}`, `已踢出 ${p}`)}>
                  <UserMinus className="size-3.5" />
                  踢出
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
