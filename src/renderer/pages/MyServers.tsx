import { useNavigate } from "react-router-dom";
import { ArrowRight, Copy, Plus, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { copyText, timeAgo } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function MyServers() {
  const servers = useConfig((s) => s.cfg.savedServers);
  const remove = useConfig((s) => s.removeSavedServer);
  const saveServer = useConfig((s) => s.saveServer);
  const mode = useConfig((s) => s.cfg.mode);
  const setMode = useConfig((s) => s.setMode);
  const navigate = useNavigate();
  const { t } = useI18n();
  const sorted = [...servers].sort((a, b) => (b.lastJoinedAt ?? 0) - (a.lastJoinedAt ?? 0));

  return (
    <>
      <PageHeader
        className="max-w-5xl"
        title={t("myServers.title", "我的服务器")}
        desc={t("myServers.desc", "打开过的邀请会自动保留在此，之后可直接继续，无需翻找聊天记录。")}
        actions={<Button variant="accent" onClick={() => navigate("/")}><Plus className="size-4" />{t("myServers.joinNew", "加入新服务器")}</Button>}
      />
      <PageBody className="max-w-5xl space-y-3">
        {sorted.length === 0 ? (
          <Card className="panel-wash">
            <EmptyState
              icon={<Server className="size-5" />}
              title={t("myServers.empty.title", "还没有去过任何服务器")}
              desc={t("myServers.empty.desc", "打开朋友发来的邀请链接或房间码后，记录会出现在这里。")}
              action={<Button variant="accent" onClick={() => navigate("/")}>{t("myServers.empty.action", "粘贴邀请")}</Button>}
            />
          </Card>
        ) : (
          sorted.map((server) => {
            const address = `${server.address}${server.port && !server.address.includes(":") ? `:${server.port}` : ""}`;
            return (
              <Card key={server.id} className="flex items-center gap-4 p-4">
                <span className="brand-mark grid size-11 shrink-0 place-items-center rounded-xl"><Server className="size-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="t-h-14 truncate text-gray-1000">{server.name}</h2>
                    {server.mcVersion ? <Badge size="sm" variant="gray">{server.mcVersion}{server.loader ? ` · ${server.loader}` : ""}</Badge> : null}
                  </div>
                  <p className="t-mono-12 mt-1.5 truncate text-gray-800" title={address}>{address}</p>
                  <p className="mt-1 text-[11px] leading-4 text-gray-700">{server.lastJoinedAt ? t("myServers.lastOpened", "上次打开 {time}", { time: timeAgo(server.lastJoinedAt) }) : t("myServers.saved", "已保存")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {server.fromRoom ? <Button size="sm" variant="accent" onClick={() => navigate(`/join/${server.fromRoom}`)}>{t("myServers.rejoin", "再次加入")}<ArrowRight className="size-3.5" /></Button> : null}
                  <Button size="sm" variant="secondary" onClick={async () => {
                    const ok = await copyText(address);
                    toast[ok ? "success" : "error"](ok ? t("myServers.copied", "服务器地址已复制") : t("pages.common.copyFailedManual", "复制失败，请手动选中地址"));
                  }}><Copy className="size-3.5" />{t("pages.common.copyAddress", "复制地址")}</Button>
                  <IconButton
                    label={t("pages.common.removeFromList", "从列表移除")}
                    size="sm"
                    onClick={async () => {
                      await remove(server.id);
                      toast.success(t("myServers.removed", "已从列表移除"), {
                        description: t("myServers.removedDesc", "不会影响现有服务器与存档。"),
                        action: { label: t("myServers.undo", "撤销"), onClick: () => void saveServer(server) },
                      });
                    }}
                  ><Trash2 className="size-3.5" /></IconButton>
                </div>
              </Card>
            );
          })
        )}

        {mode === "player" ? (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-brand-100 px-4 py-3.5">
            <div><div className="t-label-13 font-medium text-brand-700">{t("myServers.hostBanner.title", "也想自己开一台？")}</div><p className="mt-0.5 text-[12px] text-gray-800">{t("myServers.hostBanner.desc", "玩家记录会保留，可随时切换回来。")}</p></div>
            <Button size="sm" variant="secondary" onClick={() => { void setMode("host"); navigate("/"); }}>{t("myServers.hostBanner.action", "切换到服主模式")}</Button>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
