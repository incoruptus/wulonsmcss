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
import { pickPath } from "@/lib/path-picker";
import { useI18n } from "@/i18n";

export default function Instances() {
  const navigate = useNavigate();
  const { t } = useI18n();
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
        title={t("instances.title", "全部服务器")}
        desc={t("instances.desc", "每台服务器都有独立的版本、模组与存档，开启新周目时无需改动原有世界。")}
        actions={
          <>
            <Button variant="ghost" onClick={() => setFromClient(true)}><Server className="size-4" />{t("instances.fromClient", "从客户端开服")}</Button>
            <Button variant="secondary" onClick={() => setImporting(true)}><FolderInput className="size-4" />{t("instances.import", "导入现有服务器")}</Button>
            <Button variant="accent" onClick={() => setCreating(true)}><Plus className="size-4" />{t("pages.common.newServer", "新建服务器")}</Button>
          </>
        }
      />
      <PageBody>
        {instances.length === 0 ? (
          <Card className="panel-wash">
            <EmptyState
              icon={<Server className="size-5" />}
              title={t("instances.empty.title", "这里还空着")}
              desc={t("instances.empty.desc", "从零新建或导入已有服务器，开服茶会分别保存各自的配置与存档。")}
              action={<Button variant="accent" onClick={() => setCreating(true)}><Plus className="size-4" />{t("instances.empty.action", "新建第一台服务器")}</Button>}
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
                  <Badge variant={instance.lastStartedAt ? "gray" : "accent"} size="sm">{instance.lastStartedAt ? t("instances.badge.started", "已启动过") : t("instances.badge.new", "新服务器")}</Badge>
                </div>

                <div className="mt-5 rounded-lg bg-background-200 px-3 py-2.5">
                  <p className="t-mono-12 truncate text-gray-800" title={instance.dir}>{instance.dir || t("instances.noDir", "尚未绑定本机目录")}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-4 text-gray-700">
                    <Clock3 className="size-3" />{instance.lastStartedAt ? t("instances.lastStarted", "上次启动 {time}", { time: timeAgo(instance.lastStartedAt) }) : t("instances.neverStarted", "还没有启动过")}
                  </p>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-5">
                  {instance.dir ? (
                    <Button size="sm" onClick={async () => { await setActive(instance.id); navigate("/"); }}>{t("instances.open", "打开服务器")}<ArrowRight className="size-3.5" /></Button>
                  ) : (
                    <Button size="sm" onClick={async () => {
                      const dir = await pickPath({ mode: "dir", title: t("instances.pickDir", "选择这个服务器所在的文件夹") });
                      if (!dir) return;
                      const javas = await window.mcss.app.detectJava().catch(() => []);
                      const best = javas.find((java) => (java.major ?? 0) >= 21) ?? javas[0];
                      await updateInstance(instance.id, { dir, javaPath: instance.javaPath || best?.path || "", importedFrom: undefined });
                      toast.success(t("instances.dirBound", "目录已绑定"));
                    }}><FolderOpen className="size-3.5" />{t("instances.bindDir", "绑定本机目录")}</Button>
                  )}
                  <IconButton label={instance.dir ? t("pages.common.openServerDir", "打开服务器目录") : t("instances.noDirBound", "还没有绑定目录")} size="sm" variant="secondary" disabled={!instance.dir} onClick={() => window.mcss.app.openPath(instance.dir)}><FolderOpen className="size-3.5" /></IconButton>
                  <IconButton label={t("pages.common.removeFromList", "从列表移除")} size="sm" className="ml-auto hover:text-red-900" onClick={() => setPendingDelete(instance.id)}><Trash2 className="size-3.5" /></IconButton>
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
        <DialogHeader title={t("instances.remove.title", "从列表移除这台服务器？")} desc={t("instances.remove.desc", "仅移除开服茶中的记录，不会删除任何服务器文件。")} />
        <DialogBody>
          <p className="t-copy-14 text-pretty text-gray-800">
            {t("instances.remove.bodyPrefix", "「{name}」的存档、模组与配置仍保留在 ", { name: target?.name ?? "" })}<span className="t-mono-12 break-all">{target?.dir}</span>{t("instances.remove.bodySuffix", "。如需继续管理，重新导入即可。")}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>{t("instances.remove.keep", "保留")}</Button>
          <Button variant="error" onClick={async () => { if (pendingDelete) await removeInstance(pendingDelete); setPendingDelete(null); }}>{t("instances.remove.confirm", "确认移除")}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
