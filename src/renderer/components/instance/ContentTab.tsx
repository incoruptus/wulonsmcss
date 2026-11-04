import { useSearchParams } from "react-router-dom";
import { PackageSearch, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SegmentedControl } from "@/components/ui/misc";
import { ModsTab } from "@/components/instance/ModsTab";
import { PluginsTab } from "@/components/instance/PluginsTab";
import { ResourceBrowser } from "@/components/instance/ResourceBrowser";
import { contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import type { Instance } from "@/lib/types";
import { useI18n } from "@/i18n";

/**
 * 「内容」页 = 已安装 + 资源库
 * ------------------------------------------------------------
 * 以前资源库是一级导航，和实例是脱钩的：装到哪个实例要到了页面里再选。
 * 现在它就是「这个实例的模组/插件」里的一个视图，安装目标天然只有这一个。
 */
export function ContentTab({ instance, onEdit }: { instance: Instance; onEdit?: () => void }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const kind = contentKindOf(serverTypeOf(instance));
  const view = params.get("view") === "browse" ? "browse" : "installed";

  const setView = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "installed") p.delete("view");
    else p.set("view", next);
    setParams(p, { replace: true });
  };

  if (kind === "datapack") {
    return (
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gray-100">
          <PackageSearch className="size-5 text-gray-800" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="t-h-14 text-gray-1000">{t("content.datapack.title", "原版服务端没有模组或插件")}</div>
          <p className="t-label-13 mt-1 text-gray-800">
            {t("content.datapack.desc", "想装领地、传送、经济这类插件，要把服务端换成 Paper；想装模组，要换成 Fabric、Forge 或 NeoForge。插件装在服务器上，玩家用普通客户端就能进；模组装在服务器和玩家两边。")}
          </p>
        </div>
        {onEdit ? (
          <Button variant="secondary" onClick={onEdit}>
            <Settings2 className="size-4" />
            {t("content.serverSettings", "服务器设置")}
          </Button>
        ) : null}
      </Card>
    );
  }

  const label = kind === "plugin" ? t("content.label.plugin", "插件") : t("content.label.mod", "模组");
  return (
    <div className="flex flex-col gap-4">
      <p className="t-copy-13 text-gray-800">
        {t("content.descPrefix", "这里管理这台服务器的")}{label}{t("content.descSuffix", "。从资源库安装后需要重启服务器；禁用不会删除文件。")}
      </p>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-background-100 p-3 shadow-geist-border">
        <SegmentedControl
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "installed", label: t("content.tab.installed", "已装{label}", { label }) },
            { value: "browse", label: t("content.browse", "资源库") },
          ]}
        />
        <span className="t-label-12 text-gray-700">
          {view === "browse"
            ? t("content.filterHint", "按 {mc} · {type} 过滤，安装后存放于 {dir}", { mc: instance.mcVersion, type: serverTypeLabel(serverTypeOf(instance)), dir: `${instance.dir}\\${kind === "plugin" ? "plugins" : "mods"}` })
            : t("content.restartHint", "安装后需重启生效；禁用不会删除文件，可随时恢复。")}
        </span>
      </div>

      {view === "installed" ? (
        kind === "plugin" ? (
          <PluginsTab instance={instance} onBrowse={() => setView("browse")} />
        ) : (
          <ModsTab instance={instance} onBrowse={() => setView("browse")} />
        )
      ) : (
        <ResourceBrowser instance={instance} kind={kind === "plugin" ? "plugin" : "mod"} />
      )}
    </div>
  );
}
