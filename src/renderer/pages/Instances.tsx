import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Server, Trash2, FolderOpen, Play } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { useConfig } from "@/stores/config";
import { timeAgo } from "@/lib/utils";

export default function Instances() {
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const removeInstance = useConfig((s) => s.removeInstance);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const target = instances.find((i) => i.id === pendingDelete);

  return (
    <>
      <PageHeader
        title="服务器实例"
        desc="每个实例有独立的版本、Mod、配置与存档，互不干扰。"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            新建实例
          </Button>
        }
      />
      <PageBody>
        {instances.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Server className="size-5" />}
              title="还没有服务器实例"
              desc="新建时会自动下载对应版本的服务端；Fabric 实例可以直接装 Mod。"
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  新建第一个服务器
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {instances.map((inst) => (
              <Card key={inst.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-200 text-gray-900">
                      <Server className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="t-h-14 truncate text-gray-1000">{inst.name}</div>
                      <div className="t-label-12 text-gray-700">
                        {inst.mcVersion} · {inst.loader}
                        {inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}
                      </div>
                    </div>
                  </div>
                  <Badge variant={inst.lastStartedAt ? "blue" : "gray"} size="sm">
                    {inst.lastStartedAt ? timeAgo(inst.lastStartedAt) : "未启动"}
                  </Badge>
                </div>

                <p className="t-mono-12 truncate text-gray-700" title={inst.dir}>
                  {inst.dir}
                </p>

                <div className="mt-auto flex items-center gap-1.5">
                  <Button size="sm" onClick={() => navigate(`/instances/${inst.id}`)}>
                    <Play className="size-3.5" />
                    打开
                  </Button>
                  <IconButton label="打开目录" size="sm" onClick={() => window.mcss.app.openPath(inst.dir)}>
                    <FolderOpen className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="删除实例"
                    size="sm"
                    className="ml-auto hover:text-red-900"
                    onClick={() => setPendingDelete(inst.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />

      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogHeader title="删除实例？" desc="只从列表里移除，不会删除磁盘上的服务器文件。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            将会移除「{target?.name}」这个实例记录。存档、Mod 和配置都还在
            <span className="t-mono-12"> {target?.dir} </span>
            里，需要时可以重新导入。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              if (pendingDelete) await removeInstance(pendingDelete);
              setPendingDelete(null);
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
