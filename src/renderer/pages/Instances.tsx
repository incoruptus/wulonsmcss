import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, FolderInput, Plus, Server, Trash2, FolderOpen, Clock3 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { ImportInstanceDialog } from "@/components/instance/ImportInstanceDialog";
import { CreateServerFromClientDialog } from "@/components/instance/CreateServerFromClientDialog";
import { useConfig } from "@/stores/config";
import { timeAgo } from "@/lib/utils";
import { serverTypeLabel, serverTypeOf } from "@/lib/config-model";

export default function Instances() {
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const setActive = useConfig((s) => s.setActiveInstance);
  const removeInstance = useConfig((s) => s.removeInstance);
  const updateInstance = useConfig((s) => s.updateInstance);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fromClient, setFromClient] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const target = instances.find((instance) => instance.id === pendingDelete);

  return (
    <>
      <PageHeader
        title="全部服务器"
        desc="每台服务器都有独立的版本、模组和存档。想开新周目，也不必动原来的世界。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setFromClient(true)}><Server className="size-4" />从客户端开服</Button>
            <Button variant="secondary" onClick={() => setImporting(true)}><FolderInput className="size-4" />导入现有服务器</Button>
            <Button variant="accent" onClick={() => setCreating(true)}><Plus className="size-4" />新建服务器</Button>
          </>
        }
      />
      <PageBody>
        {instances.length === 0 ? (
          <Card className="panel-wash">
            <EmptyState
              icon={<Server className="size-5" />}
              title="这里还空着"
              desc="从零新建，或把已经存在的服务器导入。开服茶会分别保管它们的配置和存档。"
              action={<Button variant="accent" onClick={() => setCreating(true)}><Plus className="size-4" />新建第一台服务器</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {instances.map((instance) => (
              <Card key={instance.id} className="group flex min-h-[218px] flex-col p-5 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-geist-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="brand-mark grid size-11 shrink-0 place-items-center rounded-xl"><Server className="size-[18px]" /></span>
                    <div className="min-w-0">
                      <h2 className="t-h-16 truncate text-gray-1000" title={instance.name}>{instance.name}</h2>
                      <p className="t-label-12 mt-1 text-gray-700">
                        {instance.mcVersion} · {serverTypeLabel(serverTypeOf(instance))}{instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant={instance.lastStartedAt ? "gray" : "accent"} size="sm">{instance.lastStartedAt ? "已启动过" : "新服务器"}</Badge>
                </div>

                <div className="mt-5 rounded-lg bg-background-200 px-3 py-2.5">
                  <p className="t-mono-12 truncate text-gray-800" title={instance.dir}>{instance.dir || "尚未绑定本机目录"}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-4 text-gray-700">
                    <Clock3 className="size-3" />{instance.lastStartedAt ? `上次启动 ${timeAgo(instance.lastStartedAt)}` : "还没有启动过"}
                  </p>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-5">
                  {instance.dir ? (
                    <Button size="sm" onClick={async () => { await setActive(instance.id); navigate("/"); }}>打开服务器<ArrowRight className="size-3.5" /></Button>
                  ) : (
                    <Button size="sm" onClick={async () => {
                      const dir = await window.mcss.dialog.openDirectory();
                      if (!dir) return;
                      const javas = await window.mcss.app.detectJava().catch(() => []);
                      const best = javas.find((java) => (java.major ?? 0) >= 21) ?? javas[0];
                      await updateInstance(instance.id, { dir, javaPath: instance.javaPath || best?.path || "", importedFrom: undefined });
                      toast.success("目录已绑定");
                    }}><FolderOpen className="size-3.5" />绑定本机目录</Button>
                  )}
                  <IconButton label={instance.dir ? "打开服务器目录" : "还没有绑定目录"} size="sm" variant="secondary" disabled={!instance.dir} onClick={() => window.mcss.app.openPath(instance.dir)}><FolderOpen className="size-3.5" /></IconButton>
                  <IconButton label="从列表移除" size="sm" className="ml-auto hover:text-red-900" onClick={() => setPendingDelete(instance.id)}><Trash2 className="size-3.5" /></IconButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <CreateServerFromClientDialog open={fromClient} onOpenChange={setFromClient} />
      <ImportInstanceDialog open={importing} onOpenChange={setImporting} />

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogHeader title="从列表移除这台服务器？" desc="只移除开服茶里的记录，不会删除任何服务器文件。" />
        <DialogBody>
          <p className="t-copy-14 text-pretty text-gray-800">
            「{target?.name}」的存档、模组和配置仍会保留在 <span className="t-mono-12 break-all">{target?.dir}</span>。以后想继续管理，重新导入即可。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>保留</Button>
          <Button variant="error" onClick={async () => { if (pendingDelete) await removeInstance(pendingDelete); setPendingDelete(null); }}>确认移除</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
