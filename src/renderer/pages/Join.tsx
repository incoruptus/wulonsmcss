import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Copy, Download, Gamepad2, Package, Server, Users } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { decodeRoom, extractCode, type RoomDescriptorV1 } from "@/lib/room";
import { copyText } from "@/lib/utils";
import { useConfig } from "@/stores/config";

export default function Join() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const [input, setInput] = useState("");
  const [room, setRoom] = useState<RoomDescriptorV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(raw: string) {
    if (!raw.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await decodeRoom(raw);
      setRoom(parsed);
    } catch (e) {
      setRoom(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (code) {
      setInput(code);
      void load(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 本地是否已经有匹配的实例
  const localMatch = useMemo(() => {
    if (!room) return null;
    return (
      instances.find(
        (i) => i.mcVersion === room.mc && i.loader === room.loader && i.dir && i.port === Number(room.addr.split(":").pop()),
      ) ?? null
    );
  }, [room, instances]);

  return (
    <>
      <PageHeader
        title="加入房间"
        desc="朋友发来的链接或房间码，粘进来就能看到要准备什么。"
        actions={
          room ? (
            <Button variant="secondary" onClick={() => navigate("/")}>
              回到概览
            </Button>
          ) : undefined
        }
      />
      <PageBody className="max-w-3xl space-y-4">
        {!room ? (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-gray-800" />
                <span className="t-h-14 text-gray-1000">粘贴邀请链接 / 房间码</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load(input)}
                  placeholder="https://…/join/w1z… 或 w1z.a1b2c3.…"
                  className="font-mono text-[12.5px]"
                />
                <Button onClick={() => load(input)} loading={loading}>
                  打开
                </Button>
              </div>
              {error ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-700/10 p-2.5 t-label-12 text-red-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </div>
              ) : null}
              <p className="t-label-12 text-gray-700">
                链接里带着服务器地址、版本和需要的 Mod，不经过我们的服务器；房间码被改坏或过期会直接报错。
              </p>
            </div>
          </Card>
        ) : (
          <>
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="green" size="sm">邀请有效</Badge>
                    <span className="t-label-12 text-gray-700">{room.mc} · {room.loader}</span>
                  </div>
                  <h2 className="t-h-24 mt-1.5 text-gray-1000">{room.name}</h2>
                  <p className="t-mono-12 mt-0.5 text-gray-700">{room.addr}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    (await copyText(room.addr)) ? toast.success("地址已复制") : toast.error("复制失败");
                  }}
                >
                  <Copy className="size-4" />
                  复制地址
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Info icon={<Server className="size-3.5" />} label="版本" value={`${room.mc} · ${room.loader}`} />
                <Info icon={<Package className="size-3.5" />} label="需要的 Mod" value={room.mods.length ? `${room.mods.length} 个` : "无需额外 Mod"} />
                <Info icon={<Gamepad2 className="size-3.5" />} label="本机环境" value={localMatch ? "已有匹配实例" : "需要准备"} />
              </div>

              <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
                <div className="t-label-13 font-medium text-gray-1000">接下来要做的</div>
                <ol className="mt-1.5 space-y-1 t-label-12 text-gray-800">
                  <li>1. 确认客户端是 {room.mc} + {room.loader}（版本不对会连不上）。</li>
                  <li>2. 把服务端同款 Mod 放进客户端 <span className="t-mono-12">mods</span> 目录。</li>
                  <li>3. 进游戏 → 多人游戏 → 添加服务器 → 填 <span className="t-mono-12">{room.addr}</span>。</li>
                </ol>
              </div>

              {room.mods.length ? (
                <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
                  <div className="flex items-center justify-between">
                    <div className="t-label-13 font-medium text-gray-1000">需要这些 Mod（{room.mods.length}）</div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={async () => {
                        const text = room.mods.map((m) => m.n ?? m.p).join("\n");
                        (await copyText(text)) ? toast.success("Mod 清单已复制") : toast.error("复制失败");
                      }}
                    >
                      <Copy className="size-3" />
                      复制清单
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {room.mods.map((m) => (
                      <Badge key={m.p + m.v} variant="gray" size="sm">
                        {m.n ?? m.p}
                      </Badge>
                    ))}
                  </div>
                  <p className="t-label-12 mt-2 text-gray-700">
                    这些 Mod 记的是 Modrinth 版本号，助手可以直接按 id 拉齐；暂时也可以去资源库手动搜。
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    if (localMatch) {
                      navigate(`/instances/${localMatch.id}`);
                    } else {
                      toast.info("「准备客户端」下一步接：会调用你已有的启动器建一个匹配实例");
                    }
                  }}
                >
                  <Download className="size-4" />
                  准备客户端
                  <ArrowRight className="size-4" />
                </Button>
                <Button variant="secondary" onClick={() => navigate("/library")}>
                  <Package className="size-4" />
                  去资源库装 Mod
                </Button>
                <Button variant="ghost" onClick={() => { setRoom(null); setInput(""); }}>
                  换一个房间码
                </Button>
              </div>
            </Card>

            {room.note ? (
              <Card>
                <div className="t-label-12 text-gray-700">服主留言</div>
                <div className="t-label-13 mt-1 whitespace-pre-wrap text-gray-1000">{room.note}</div>
              </Card>
            ) : null}
          </>
        )}

        {!room && !error ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="还没有邀请"
            desc="让服主在「邀请朋友」里生成一条链接，发给你就行。"
            className="py-10"
          />
        ) : null}
      </PageBody>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-100 p-2.5 shadow-geist-border">
      <div className="flex items-center gap-1.5 text-gray-700">
        {icon}
        <span className="t-label-12">{label}</span>
      </div>
      <div className="t-label-13 mt-1 text-gray-1000">{value}</div>
    </div>
  );
}
