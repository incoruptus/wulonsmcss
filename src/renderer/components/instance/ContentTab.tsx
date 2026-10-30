import { useSearchParams } from "react-router-dom";
import { PackageSearch, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SegmentedControl } from "@/components/ui/misc";
import { ModsTab } from "@/components/instance/ModsTab";
import { PluginsTab } from "@/components/instance/PluginsTab";
import { ResourceBrowser } from "@/components/instance/ResourceBrowser";
import { contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import type { Instance } from "@/lib/types";

/**
 * 「内容」页 = 已安装 + 资源库
 * ------------------------------------------------------------
 * 以前资源库是一级导航，和实例是脱钩的：装到哪个实例要到了页面里再选。
 * 现在它就是「这个实例的模组/插件」里的一个视图，安装目标天然只有这一个。
 */
export function ContentTab({ instance, onEdit }: { instance: Instance; onEdit?: () => void }) {
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
          <div className="t-h-14 text-gray-1000">原版服务端没有模组或插件</div>
          <p className="t-label-13 mt-1 text-gray-800">
            插件（地皮、传送、经济）需要 Paper 核心；模组需要 Fabric / Forge / NeoForge。
            换核心不影响玩家：插件服仍然用原版客户端就能进。
          </p>
        </div>
        {onEdit ? (
          <Button variant="secondary" onClick={onEdit}>
            <Settings2 className="size-4" />
            换核心
          </Button>
        ) : null}
      </Card>
    );
  }

  const label = kind === "plugin" ? "插件" : "模组";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "installed", label: `已装${label}` },
            { value: "browse", label: "资源库" },
          ]}
        />
        <span className="t-label-12 text-gray-700">
          {view === "browse"
            ? `按 ${instance.mcVersion} · ${serverTypeLabel(serverTypeOf(instance))} 过滤；安装后落在 ${instance.dir}\\${kind === "plugin" ? "plugins" : "mods"}`
            : "装完重启服务器生效；禁用只是改名，不会删文件。"}
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
