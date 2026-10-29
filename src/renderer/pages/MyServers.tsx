import { useNavigate } from "react-router-dom";
import { Copy, Globe2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { copyText, timeAgo } from "@/lib/utils";

/**
 * 我的服务器
 * ------------------------------------------------------------
 * 不做"内容市场/游戏大厅"——我们没有货源，做了就是空壳。
 * 这里只放**你去过的、你保存的**服务器，加上"再进去一次"。
 */
export default function MyServers() {
  const servers = useConfig((s) => s.cfg.savedServers);
  const remove = useConfig((s) => s.removeSavedServer);
  const mode = useConfig((s) => s.cfg.mode);
  const setMode = useConfig((s) => s.setMode);
  const navigate = useNavigate();

  const sorted = [...servers].sort((a, b) => (b.lastJoinedAt ?? 0) - (a.lastJoinedAt ?? 0));

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="t-h-24 text-gray-1000">我的服务器</h1>
          <p className="t-label-13 mt-1 text-gray-800">你去过的、保存过的服。加入新服时勾一下「记住」，它就会出现在这里。</p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/")}>
          <Plus className="size-4" />
          加入新服
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        {sorted.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Globe2 className="size-5" />}
              title="还没有保存过服务器"
              desc="在「加入游戏」里粘贴一个房间码或地址，进去一次就会留在这里。"
              action={
                <Button onClick={() => navigate("/")}>去加入一个</Button>
              }
            />
          </Card>
        ) : (
          sorted.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl bg-background-100 px-4 py-3 shadow-geist-border"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-900">
                <Globe2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="t-label-14 truncate font-medium text-gray-1000">{s.name}</span>
                  {s.mcVersion ? <span className="t-label-12 text-gray-700">{s.mcVersion}</span> : null}
                  {s.loader ? <span className="t-label-12 text-gray-700">· {s.loader}</span> : null}
                </div>
                <div className="t-mono-12 mt-0.5 truncate text-gray-800">
                  {s.address}
                  {s.port && !s.address.includes(":") ? `:${s.port}` : ""}
                </div>
              </div>
              <span className="t-label-12 shrink-0 text-gray-700">{s.lastJoinedAt ? timeAgo(s.lastJoinedAt) : ""}</span>
              <Button
                variant="secondary"
                onClick={async () => {
                  const ok = await copyText(`${s.address}${s.port && !s.address.includes(":") ? `:${s.port}` : ""}`);
                  toast[ok ? "success" : "error"](ok ? "地址已复制" : "复制失败，请手动选中");
                }}
              >
                <Copy className="size-4" />
                复制地址
              </Button>
              <button
                aria-label="删除"
                title="删除"
                onClick={() => {
                  void remove(s.id);
                  toast.success("已从列表移除");
                }}
                className="grid size-8 place-items-center rounded-md text-gray-700 transition-colors hover:bg-red-700/10 hover:text-red-900"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {mode === "player" ? (
        <p className="mt-6 t-label-13 text-gray-800">
          想自己开一个？{" "}
          <button
            className="text-blue-900 hover:underline"
            onClick={() => {
              void setMode("host");
              navigate("/");
            }}
          >
            切到服主模式
          </button>
          （两边用的是同一套东西，随时切回来）。
        </p>
      ) : null}
    </div>
  );
}
