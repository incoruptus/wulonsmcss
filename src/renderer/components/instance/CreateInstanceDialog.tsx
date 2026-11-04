import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, FolderOpen } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Progress } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, McVersion, ServerType } from "@/lib/types";
import { safeName } from "@/lib/utils";
import { contentKindOf, serverTypeLabel } from "@/lib/config-model";
import { normalizeLoaders, pickLoader } from "@/lib/loaders";
import { CORES as GUIDE_CORES, coreLabel, coreMeta } from "@/lib/server-guide";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";
import { pickPath } from "@/lib/path-picker";
import { useI18n } from "@/i18n";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);

  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [serverType, setServerType] = useState<ServerType>("paper");
  const [build, setBuild] = useState("");
  const [dir, setDir] = useState("");
  const [memoryMin, setMemoryMin] = useState(2);
  const [memoryMax, setMemoryMax] = useState(4);
  const [javaPath, setJavaPath] = useState("");

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [javas, setJavas] = useState<JavaInfo[]>([]);
  const [baseDir, setBaseDir] = useState("");

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; detail?: string } | null>(null);

  // 打开时加载版本清单 / Java / 默认目录
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const info = await window.mcss.app.info().catch(() => null);
      if (alive && info) setBaseDir(`${info.appData}\\instances`);
      const [list, jlist] = await Promise.all([
        window.mcss.versions.minecraft().catch(() => [] as McVersion[]),
        window.mcss.app.detectJava().catch(() => [] as JavaInfo[]),
      ]);
      if (!alive) return;
      setVersions(list);
      setJavas(jlist);
      setMcVersion((v) => v || list.find((x) => x.type === "release")?.id || list[0]?.id || "");
      setName((n) => n || "我的服务器");
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // 版本/核心联动：拉该核心在这个 MC 版本下的构建列表
  useEffect(() => {
    if (!open || !mcVersion) return;
    let alive = true;
    window.mcss.versions
      .serverBuilds(serverType, mcVersion)
      .then((raw) => {
        if (!alive) return;
        const list = normalizeLoaders(raw);
        setBuilds(list);
        setBuild((v) => pickLoader(v, list));
      })
      .catch(() => {
        if (!alive) return;
        setBuilds([]);
        setBuild("");
      });
    return () => {
      alive = false;
    };
  }, [open, mcVersion, serverType]);

  const finalDir = useMemo(() => {
    if (dir) return dir;
    const leaf = safeName(name || `${mcVersion}-${serverType}`);
    return baseDir ? `${baseDir}\\${leaf}` : "";
  }, [dir, name, mcVersion, serverType, baseDir]);

  const releaseOptions = useMemo(
    () =>
      versions
        .filter((v) => v.type === "release" || v.type === "snapshot")
        .slice(0, 240)
        .map((v) => ({
          value: v.id,
          label: `${v.id}${v.type === "release" ? "" : t("create.snapshotSuffix", "（快照）")}`,
        })),
    [versions, t],
  );

  const kind = contentKindOf(serverType);
  const coreInfo = coreMeta(serverType);
  const activeJava = javas.find((j) => j.path === javaPath);
  const requiredJava = javaMajorFor(mcVersion);

  // 版本决定 Java：26.x 要 25、1.20.5+ 要 21、1.18+ 要 17；选错 Java 起不来
  useEffect(() => {
    if (!mcVersion || !javas.length) return;
    const picked = pickJavaFor(javas, javaMajorFor(mcVersion));
    if (picked) setJavaPath(picked.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcVersion, javas]);

  async function browseDir() {
    const picked = await pickPath({ mode: "dir", title: t("create.pickDirTitle", "选择服务器安装位置"), defaultPath: finalDir });
    if (picked) setDir(picked);
  }

  async function install() {
    if (!name.trim()) return toast.error(t("create.noName", "先给服务器起个名字"));
    if (!mcVersion) return toast.error(t("create.noVersion", "先选一个 Minecraft 版本"));
    if (!javaPath) return toast.error(t("create.noJava", "未找到 Java，请先手动指定"));
    const need = javaMajorFor(mcVersion);
    const picked = javas.find((j) => j.path === javaPath);
    if (picked && Number(picked.major) < need) {
      return toast.error(t("create.javaVersionMismatch", "Minecraft {mc} 需要 Java {need}，当前选择的是 Java {current}", { mc: mcVersion, need, current: picked.major }));
    }

    setInstalling(true);
    setProgress({ stage: t("create.progress.preparing", "准备中"), percent: 0 });
    const off = window.mcss.versions.onProgress(setProgress);
    try {
      const res = await window.mcss.versions.install({
        dir: finalDir,
        mc: mcVersion,
        serverType,
        loaderVersion: serverType === "fabric" ? build : undefined,
        build: kind === "plugin" || serverType === "forge" || serverType === "neoforge" ? build : undefined,
        javaPath,
      });
      if (!res.ok) throw new Error(res.error || t("create.installFailed", "安装失败"));
      const inst = makeInstance({
        name: name.trim(),
        dir: finalDir,
        mcVersion,
        serverType,
        loaderVersion: serverType === "fabric" ? build : undefined,
        buildNumber: kind === "plugin" && res.build ? Number(res.build) : undefined,
        javaPath,
        memoryMin,
        memoryMax,
        port: 25565,
      });
      await addInstance(inst);
      toast.success(t("create.installed", "服务器装好了"), {
        description: `${inst.mcVersion} · ${serverTypeLabel(serverType)}${build ? ` ${build}` : ""}`,
      });
      onOpenChange(false);
      reset();
      navigate("/");
    } catch (e) {
      toast.error(t("create.errInstallDetail", "安装失败：{msg}", { msg: (e as Error).message }));
    } finally {
      off();
      setInstalling(false);
      setProgress(null);
    }
  }

  function reset() {
    setName("");
    setDir("");
    setBuild("");
    setMemoryMin(2);
    setMemoryMax(4);
    setProgress(null);
  }

  function useRecommended() {
    const latest = versions.find((v) => v.type === "release")?.id || versions[0]?.id || mcVersion;
    if (latest) setMcVersion(latest);
    setServerType("paper");
    setMemoryMin(2);
    setMemoryMax(4);
    setBuild("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !installing && onOpenChange(v)} widthClass="max-w-2xl">
      <DialogHeader
        title={t("create.title", "新建服务器")}
        desc={t("create.desc", "先选择游戏版本，再决定玩法方向。玩家用普通 Minecraft 客户端就能进；要加模组时，玩家也要装同样的模组。")}
      />
      <DialogBody className="space-y-4">
        <Callout
          tone="info"
          title={t("create.help.title", "不知道怎么选？")}
          action={
            <Button size="xs" variant="secondary" onClick={useRecommended}>
              {t("create.help.action", "用推荐配置")}
            </Button>
          }
        >
          {t("create.help.body", "只想和朋友玩原版，或者加领地、传送这类插件，用推荐配置就行。想装模组，再按下面「用哪种服务端」的说明换成 Fabric。")}
        </Callout>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("create.nameLabel", "服务器名称")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("create.namePlaceholder", "例如：和朋友一起玩")} />
          </Field>
          <Field label={t("create.mcVersion", "Minecraft 版本")}>
            <Picker
              value={mcVersion}
              onValueChange={setMcVersion}
              options={releaseOptions.length ? releaseOptions : [{ value: "", label: t("create.loading", "加载中…") }]}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("create.typeLabel", "用哪种服务端")}
            hint={
              coreInfo
                ? `${coreInfo.client}。${coreInfo.caveat}${
                    kind === "mod" && mcVersion.startsWith("26.")
                      ? t("create.type26Hint", "；26.x 的模组还少，建议 1.21.11 或 1.21.1 + Fabric")
                      : ""
                  }`
                : t("create.typeHint", "决定能不能装插件或模组")
            }
          >
            <Picker
              value={serverType}
              onValueChange={(v) => setServerType(v as ServerType)}
              options={GUIDE_CORES.filter((c) => c.supported !== false).map((c) => ({
                value: c.type,
                // 触发框只放短名；细节在下面的 hint 里，避免长标签把相邻字段顶歪
                label: coreLabel(c.type, t),
              }))}
            />
          </Field>
          <Field
            label={kind === "plugin" ? t("create.buildLabelPlugin", "服务端版本") : t("create.buildLabelMod", "Fabric Loader")}
            hint={
              kind === "plugin"
                ? build
                  ? t("create.buildHintDefault", "默认选最新稳定版，一般不用改")
                  : builds.length
                    ? t("create.buildHintSelect", "选一个版本")
                    : t("create.buildHintNone", "这个版本还没有可用构建")
                : serverType === "vanilla"
                  ? t("create.buildHintVanilla", "原版服务端不需要")
                  : t("create.buildHintStable", "默认已选稳定版")
            }
          >
            <Picker
              disabled={serverType === "vanilla" || builds.length === 0}
              value={build}
              onValueChange={setBuild}
              options={builds.length ? builds.map((l) => ({ value: l, label: l })) : [{ value: "", label: "—" }]}
            />
          </Field>
        </div>
        <p className="t-label-12 text-gray-700">
          {t("create.neoforgeNote", "暂不支持新建 NeoForge 服务器；已有 NeoForge 服务器请使用「导入现有服务器」。")}
        </p>

        <Field label={t("create.dirLabel", "安装目录")} hint={t("create.dirHint", "默认在应用数据目录下按名称创建，可修改到其它磁盘")}>
          <div className="flex gap-2">
            <Input value={finalDir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" />
            <Button variant="secondary" onClick={browseDir}>
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("create.memoryMin", "初始内存 {gb} GB", { gb: memoryMin })}>
            <Slider
              ariaLabel={t("create.aria.memoryMin", "初始内存")}
              min={1}
              max={32}
              step={1}
              value={[memoryMin]}
              onValueChange={([v]) => setMemoryMin(Math.min(v, memoryMax))}
            />
          </Field>
          <Field label={t("create.memoryMax", "最大内存 {gb} GB", { gb: memoryMax })}>
            <Slider
              ariaLabel={t("create.aria.memoryMax", "最大内存")}
              min={1}
              max={32}
              step={1}
              value={[memoryMax]}
              onValueChange={([v]) => setMemoryMax(Math.max(v, memoryMin))}
            />
          </Field>
        </div>

        <Field
          label={t("create.javaLabel", "Java 运行时")}
          hint={
            activeJava
              ? `${t("create.javaHint", "该版本需要 Java {need}，当前选择的是 Java {current}", { need: requiredJava, current: activeJava.major ?? "?" })}${Number(activeJava.major ?? 0) < requiredJava ? t("create.javaNotEnough", "（不够）") : ""}`
              : javas.length
                ? t("create.javaAuto", "自动检测到的 Java 运行时")
                : t("create.javaMissing", "未检测到，请点击右侧手动指定")
          }
        >
          <div className="flex gap-2">
            <Picker
              className="min-w-0 flex-1"
              value={javaPath}
              onValueChange={setJavaPath}
              options={
                javas.length
                  ? javas.map((j) => ({
                      value: j.path,
                      label: `Java ${j.major ?? "?"} · ${j.path.split(/[\\/]/).pop() || "java"}`,
                    }))
                  : [{ value: "", label: t("create.javaNotFound", "未找到 Java") }]
              }
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const p = await window.mcss.app.pickJava();
                if (p) setJavaPath(p);
              }}
            >
              {t("create.choose", "指定")}
            </Button>
          </div>
        </Field>

        {progress ? (
          <div className="rounded-lg bg-background-200 p-3">
            <div className="mb-2 flex items-center justify-between t-label-12 text-gray-800">
              <span>{progress.stage}</span>
              <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
            </div>
            <Progress value={Math.max(2, progress.percent)} label={progress.stage} />
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={installing}>
          {t("create.cancel", "取消")}
        </Button>
        <Button
          onClick={install}
          loading={installing}
          disabled={!javaPath || (serverType !== "vanilla" && builds.length === 0)}
          title={
            !javaPath
              ? t("create.javaFirst", "先选一个 Java")
              : serverType !== "vanilla" && builds.length === 0
                ? t("create.noBuilds", "这个核心/版本没有可用构建")
                : undefined
          }
        >
          {installing ? null : <Download className="size-4" />}
          {t("create.download", "下载并创建")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
