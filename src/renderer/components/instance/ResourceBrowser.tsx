import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  PackageSearch,
  RefreshCw,
  Search,
  Star,
  Tag,
  X,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Picker } from "@/components/ui/picker";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import { useConfig } from "@/stores/config";
import { serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { zhNameOf, zhSearchSlugs, isCjk } from "@/lib/zh-names";
import {
  CATEGORY_ORDER,
  ENVIRONMENT_OPTIONS,
  SORT_OPTIONS,
  LOADER_ZH,
  categoryLabel,
  environmentLabel,
  environmentOf,
  loaderLabel,
} from "@/lib/modrinth-taxonomy";
import { copyText, formatBytes, formatCount } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { AppConfig, Instance } from "@/lib/types";

interface Hit {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads: number;
  follows?: number;
  author?: string;
  categories: string[];
  gameVersions?: string[];
  /** 中文名反向搜出来的项目：可能不适合当前实例，标出来而不是藏掉 */
  compatible?: boolean;
  clientSide?: string;
  serverSide?: string;
  license?: string;
  dateModified?: string;
}

interface Project {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: string[];
  additionalCategories: string[];
  clientSide?: string;
  serverSide?: string;
  downloads: number;
  followers: number;
  iconUrl?: string;
  gallery: string[];
  published?: string;
  updated?: string;
  license?: { id?: string; name?: string; url?: string };
  sourceUrl?: string;
  issuesUrl?: string;
  wikiUrl?: string;
  discordUrl?: string;
  projectType: string;
  loaders: string[];
  gameVersions: string[];
}

interface Version {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  files: { url: string; filename: string; size: number; primary: boolean }[];
}

type Kind = "mod" | "plugin";

const PAGE = 24;
const EMPTY_MODRINTH_INDEX: NonNullable<AppConfig["modrinthIndex"]> = {};

/**
 * 资源库（模组 / 插件）
 * ------------------------------------------------------------
 * 设计目标是「信息密度高、但一眼能扫」：
 *   一行 = 图标 + 中文名 + 英文名 + 标签 + 下载量 + 一句简介
 * 点一行看详情（中文简介 / 图库 / 版本选择），而不是三列大卡片。
 * 中文名来自 MC 百科（见 lib/zh-names.ts），没有就老实显示英文。
 */
export function ResourceBrowser({ instance, kind }: { instance: Instance; kind: Kind }) {
  const { t } = useI18n();
  const modrinthIndex = useConfig((s) => s.cfg.modrinthIndex) ?? EMPTY_MODRINTH_INDEX;
  const patch = useConfig((s) => s.patch);

  const serverType = serverTypeOf(instance);
  const loader =
    kind === "plugin"
      ? "paper"
      : serverType === "fabric" || serverType === "forge" || serverType === "neoforge"
        ? serverType
        : undefined;
  const contentDir = `${instance.dir}\\${kind === "plugin" ? "plugins" : "mods"}`;

  // 支持 ?q=机械动力 深链：搜到的东西可以直接发给别人
  const [params] = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("relevance");
  const [cats, setCats] = useState<string[]>([]);
  const [env, setEnv] = useState<string>("any");
  const [showAllCats, setShowAllCats] = useState(false);

  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [zhMatched, setZhMatched] = useState(false);
  const [installedFiles, setInstalledFiles] = useState<Set<string>>(new Set());
  /** 已装 Mod 的 mod id（fabric.mod.json / 文件名兜底）：用来在没建过索引时也认出「已装」 */
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);
  /** 列表里显示「最新适配版本」：搜索接口不带版本号，按可见行补一次（并发 4，失败就空着） */
  const [latest, setLatest] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<Hit | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectZh, setProjectZh] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [installingVersion, setInstallingVersion] = useState<string | null>(null);

  const reqId = useRef(0);
  const catsKey = cats.join(",");

  async function refreshInstalled() {
    const [list, scanned] = await Promise.all([
      window.mcss.fs.list(contentDir).catch(() => []),
      kind === "mod" ? window.mcss.mods.scan(contentDir).catch(() => []) : Promise.resolve([]),
    ]);
    setInstalledFiles(new Set(list.filter((e) => !e.isDir && /\.jar(\.disabled)?$/i.test(e.name)).map((e) => e.name)));
    setInstalledIds(new Set(scanned.map((m) => String(m.id).toLowerCase())));
  }

  useEffect(() => {
    void refreshInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentDir]);

  const installedProjects = useMemo(() => {
    const set = new Set<string>();
    for (const [file, ref] of Object.entries(modrinthIndex)) {
      if (installedFiles.has(file)) set.add(ref.p);
    }
    return set;
  }, [modrinthIndex, installedFiles]);

  /** 装了没有：索引命中、mod id 命中，插件再退回文件名前缀 */
  function isInstalled(hit: Hit): boolean {
    if (installedProjects.has(hit.id)) return true;
    const slug = hit.slug.toLowerCase();
    if (installedIds.has(slug)) return true;
    if (kind === "plugin") {
      return [...installedFiles].some((f) => {
        const base = f.toLowerCase().replace(/\.disabled$/i, "").replace(/\.jar$/i, "");
        return base.startsWith(slug);
      });
    }
    return false;
  }

  const installedCount = kind === "mod" ? installedIds.size || installedFiles.size : installedFiles.size;

  async function queryPage(q: string, offset: number): Promise<{ hits: Hit[]; total: number; zh: boolean }> {
    const base = {
      mcVersion: instance.mcVersion,
      loader,
      projectType: kind === "plugin" ? ("plugin" as const) : ("mod" as const),
      categories: cats,
      environment: env === "any" ? undefined : (env as "client" | "server" | "both"),
      sort,
    };
    if (isCjk(q)) {
      const slugs = zhSearchSlugs(q, 6);
      if (slugs.length) {
        // 中文名反查时不带版本/加载器 facet：先把这个项目找出来，
        // 不兼容就在列表里明确标「不适配」，而不是假装它不存在。
        const pages = await Promise.all(
          slugs.map((s) =>
            window.mcss.modrinth
              .search(s, { projectType: kind === "plugin" ? "plugin" : "mod", limit: 1, offset: 0, sort: "relevance" })
              .catch(() => null),
          ),
        );
        const picked: Hit[] = [];
        const seen = new Set<string>();
        pages.forEach((page, i) => {
          const hit = page?.hits[0];
          if (!hit) return;
          // 只认 slug 对得上的那一条，避免中文关键词串到别的项目
          if (hit.slug.toLowerCase() !== slugs[i].toLowerCase()) return;
          if (seen.has(hit.id)) return;
          if (cats.length && !cats.some((c) => hit.categories.includes(c))) return;
          seen.add(hit.id);
          const loaderOk = !loader || hit.categories.includes(loader);
          const versionOk = !hit.gameVersions?.length || hit.gameVersions.includes(instance.mcVersion);
          picked.push({ ...(hit as Hit), compatible: loaderOk && versionOk });
        });
        picked.sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.downloads - a.downloads);
        if (picked.length) return { hits: picked, total: picked.length, zh: true };
      }
    }
    const page = await window.mcss.modrinth.search(q, { ...base, limit: PAGE, offset });
    return { hits: page.hits as Hit[], total: page.total, zh: false };
  }

  async function load(offset: number, append: boolean) {
    const id = ++reqId.current;
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const page = await queryPage(query, offset);
      if (id !== reqId.current) return;
      setHits((prev) => {
        if (!append) return page.hits;
        const seen = new Set(prev.map((h) => h.id));
        return [...prev, ...page.hits.filter((h) => !seen.has(h.id))];
      });
      setTotal(page.total);
      setZhMatched(page.zh);
    } catch (e) {
      if (id === reqId.current) toast.error(t("resource.errSearch", "搜索失败：{msg}", { msg: (e as Error).message }));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id, instance.mcVersion, query, sort, catsKey, env]);

  useEffect(() => {
    const missing = hits.filter((h) => latest[h.id] === undefined).slice(0, PAGE);
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < missing.length; i += 4) {
        if (cancelled) return;
        await Promise.all(
          missing.slice(i, i + 4).map(async (hit) => {
            try {
              const list = await window.mcss.modrinth.versions(hit.id, { mcVersion: instance.mcVersion, loader });
              if (cancelled || !list[0]) return;
              setLatest((prev) => ({ ...prev, [hit.id]: list[0].versionNumber }));
            } catch {
              // 拉不到版本不影响列表：详情里还能看
            }
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits.map((h) => h.id).join(","), instance.mcVersion, loader]);

  const hasMore = !zhMatched && hits.length < total;

  function submit() {
    // 同一个词再按一次回车也应该重新查（比如网络刚恢复）
    if (draft === query) void load(0, false);
    else setQuery(draft);
  }

  function toggleCat(slug: string) {
    setCats((prev) => (prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]));
  }

  async function installVersion(hit: Hit, version: Version | undefined, source: "row" | "detail") {
    if (source === "row") setInstalling(hit.id);
    else setInstallingVersion(version?.id ?? "latest");
    try {
      if (!version) throw new Error(t("resource.errNoVersion", "该项目没有适配当前服务器的版本"));
      const file = version.files.find((f) => f.primary) ?? version.files[0];
      if (!file) throw new Error(t("resource.errNoFile", "这个版本没有可下载文件"));
      const res = await window.mcss.modrinth.install({
        dir: instance.dir,
        fileUrl: file.url,
        fileName: file.filename,
        kind,
      });
      if (!res.ok) throw new Error(res.error || t("resource.errInstall", "安装失败"));
      await patch({
        modrinthIndex: {
          ...(useConfig.getState().cfg.modrinthIndex ?? {}),
          [file.filename]: { p: hit.id, v: version.id, n: hit.title },
        },
      });
      await refreshInstalled();
      toast.success(kind === "plugin" ? t("resource.pluginInstalled", "插件已安装") : t("resource.modInstalled", "Mod 已安装"), {
        description: `${zhNameOf(hit.slug) ?? hit.title} ${version.versionNumber} · ${formatBytes(file.size)} → ${kind === "plugin" ? "plugins/" : "mods/"}`,
      });
    } catch (e) {
      toast.error(t("resource.errInstallDetail", "安装失败：{msg}", { msg: (e as Error).message }));
    } finally {
      setInstalling(null);
      setInstallingVersion(null);
    }
  }

  async function quickInstall(hit: Hit) {
    setInstalling(hit.id);
    try {
      if (hit.compatible === false) {
        throw new Error(t("resource.errIncompatible", "没有适配 {mc} · {type} 的文件", { mc: instance.mcVersion, type: serverTypeLabel(serverType) }));
      }
      const list = await window.mcss.modrinth.versions(hit.id, { mcVersion: instance.mcVersion, loader });
      if (!list.length) throw new Error(t("resource.errIncompatibleCurrent", "没有适配当前版本的文件"));
      await installVersion(hit, list[0] as Version, "row");
    } catch (e) {
      toast.error(t("resource.errInstallDetail", "安装失败：{msg}", { msg: (e as Error).message }));
    } finally {
      setInstalling(null);
    }
  }

  async function openDetail(hit: Hit) {
    setSelected(hit);
    setProject(null);
    setProjectZh(null);
    setVersions([]);
    setDetailError(null);
    setDetailLoading(true);
    const [p, zh, vs] = await Promise.all([
      window.mcss.modrinth.project(hit.id).catch((e: Error) => {
        setDetailError(e.message);
        return null;
      }),
      window.mcss.modrinth.translate(hit.id).catch(() => null),
      window.mcss.modrinth.versions(hit.id, { mcVersion: instance.mcVersion, loader }).catch(() => []),
    ]);
    setProject((p as Project) ?? null);
    setProjectZh(zh?.translated ?? null);
    setVersions((vs as Version[]) ?? []);
    setDetailLoading(false);
  }

  const zhName = selected ? zhNameOf(selected.slug) : null;
  const selectedDone = selected ? isInstalled(selected) : false;

  const rowMenu = (hit: Hit): ContextMenuItem[] => [
    { label: t("resource.menu.detail", "查看详情"), icon: PackageSearch, onSelect: () => void openDetail(hit) },
    {
      label: t("resource.menu.copyName", "复制英文名"),
      icon: Tag,
      onSelect: () => void copyText(hit.title).then((ok) => (ok ? toast.success(t("resource.copied", "已复制")) : toast.error(t("resource.copyFailed", "复制失败")))),
    },
    { separator: true, label: "" },
    {
      label: t("resource.menu.openBrowser", "在浏览器打开"),
      icon: ArrowUpRight,
      onSelect: () => window.mcss.app.openExternal(`https://modrinth.com/${kind}/${hit.slug}`),
    },
  ];

  return (
    <div className="space-y-3">
      {/* 搜索 / 排序 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-700" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={
              kind === "plugin"
                ? t("resource.search.pluginPlaceholder", "搜索插件，例如 EssentialsX、领地、权限，也可直接输入中文名")
                : t("resource.search.modPlaceholder", "搜索模组，例如 sodium、优化、小地图，也可直接输入中文名")
            }
            className="h-9 pl-9"
          />
          {draft ? (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-1000"
              onClick={() => {
                setDraft("");
                setQuery("");
              }}
              aria-label={t("resource.search.clear", "清空搜索")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Picker
          className="w-[150px]"
          value={sort}
          onValueChange={setSort}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.key, o.label) }))}
          aria-label={t("resource.sort", "排序")}
        />
        <Button onClick={submit} loading={loading}>
          <Search className="size-4" />
          {t("resource.search", "搜索")}
        </Button>
        <IconButton
          label={t("resource.reload", "重新加载")}
          onClick={() => {
            void refreshInstalled();
            void load(0, false);
          }}
        >
          <RefreshCw className="size-4" />
        </IconButton>
        <IconButton label={t("resource.openDir", "打开内容目录")} onClick={() => window.mcss.app.openPath(contentDir)}>
          <FolderOpen className="size-4" />
        </IconButton>
      </div>

      {/* 筛选 */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="t-label-12 mr-1 shrink-0 text-gray-700">{t("resource.categories", "分类")}</span>
          {(showAllCats ? CATEGORY_ORDER : CATEGORY_ORDER.slice(0, 9)).map((slug) => (
            <button
              key={slug}
              onClick={() => toggleCat(slug)}
              className={
                cats.includes(slug)
                  ? "h-6 rounded-full bg-gray-1000 px-2.5 t-label-12 text-background-100"
                  : "h-6 rounded-full bg-gray-100 px-2.5 t-label-12 text-gray-900 hover:bg-gray-200"
              }
            >
              {categoryLabel(slug)}
            </button>
          ))}
          <button className="h-6 px-1.5 t-label-12 text-blue-900 hover:underline" onClick={() => setShowAllCats((v) => !v)}>
            {showAllCats ? t("resource.collapse", "收起") : t("resource.more", "更多")}
          </button>
          {(cats.length > 0 || env !== "any") ? (
            <button
              className="h-6 px-1.5 t-label-12 text-gray-700 hover:text-gray-1000"
              onClick={() => {
                setCats([]);
                setEnv("any");
              }}
            >
              {t("resource.clear", "清除")}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="t-label-12 mr-1 shrink-0 text-gray-700">{t("resource.environment", "环境")}</span>
          {ENVIRONMENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setEnv(o.value)}
              className={
                env === o.value
                  ? "h-6 rounded-full bg-gray-1000 px-2.5 t-label-12 text-background-100"
                  : "h-6 rounded-full bg-gray-100 px-2.5 t-label-12 text-gray-900 hover:bg-gray-200"
              }
            >
              {t(o.key, o.label)}
            </button>
          ))}
          <span className="ml-auto t-label-12 text-gray-700">
            {zhMatched ? t("resource.zhMatched", "按中文名匹配 · {n} 个", { n: total }) : t("resource.totalResults", "共 {n} 个结果", { n: total.toLocaleString() })}
            {installedCount ? t("resource.installedCount", " · 已装 {n}", { n: installedCount }) : ""}
          </span>
        </div>
      </div>

      {/* 列表 */}
      {loading && hits.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 t-label-13 text-gray-800">
          <Spinner /> {t("resource.searchingModrinth", "正在查 Modrinth…")}
        </div>
      ) : hits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageSearch className="size-5" />}
            title={isCjk(query) ? t("resource.noZhResultTitle", "没有找到这个中文名的项目") : t("resource.noResultTitle", "没有结果")}
            desc={
              isCjk(query)
                ? t("resource.noZhResultDesc", "中文名库仅收录 MC 百科已有的条目，可尝试英文名，或直接使用上方分类筛选。")
                : t("resource.noResultDesc", "请更换关键词，或确认 {mc} · {type} 是否提供对应的{label}。", { mc: instance.mcVersion, type: serverTypeLabel(serverType), label: kind === "plugin" ? t("resource.kind.plugin", "插件") : t("resource.kind.mod", "Mod") })
            }
            action={
              query ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft("");
                    setQuery("");
                  }}
                >
                  {t("resource.clearSeeAll", "清空搜索，看看全部")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background-100 shadow-geist-border">
          <div className="flex items-center gap-3 border-b border-gray-300 px-3 py-2 t-label-12 text-gray-700">
            <span>{query ? t("resource.queryResults", "“{q}” 的结果", { q: query }) : t("resource.all", "全部")}</span>
            <span className="text-gray-600">·</span>
            <span>{hits.length} / {zhMatched ? total : total.toLocaleString()}</span>
            {zhMatched ? <Badge variant="blue" size="sm">{t("resource.zhBadge", "中文名")}</Badge> : null}
          </div>
          <div className="divide-y divide-gray-300/70">
            {hits.map((hit) => {
              const zh = zhNameOf(hit.slug);
              const done = isInstalled(hit);
              const environment = environmentOf(hit);
              const tags = hit.categories.filter((c) => !(c in LOADER_ZH)).slice(0, 4);
              const incompatible = hit.compatible === false;
              return (
                <ContextMenu key={hit.id} items={rowMenu(hit)}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openDetail(hit)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openDetail(hit);
                      }
                    }}
                    className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-100/70 focus-visible:bg-gray-100/70 focus-visible:outline-none"
                  >
                    {hit.iconUrl ? (
                      <img src={hit.iconUrl} alt="" className="mt-0.5 size-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-gray-200">
                        <PackageSearch className="size-5 text-gray-700" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="t-label-14 truncate font-medium text-gray-1000">{zh ?? hit.title}</span>
                        {zh ? <span className="t-label-12 shrink-0 text-gray-700">{hit.title}</span> : null}
                        {latest[hit.id] ? (
                          <span className="t-mono-12 shrink-0 text-gray-700">· {latest[hit.id]}</span>
                        ) : null}
                        <span className="ml-auto flex shrink-0 items-center gap-1 t-label-12 tabular-nums text-gray-700">
                          <Download className="size-3" />
                          {formatCount(hit.downloads)}
                        </span>
                        {incompatible ? (
                          <Badge variant="amber" size="sm" title={t("resource.noCompatTitle", "没有适配 {mc}", { mc: instance.mcVersion })}>
                            {t("resource.notCompatible", "不适配")}
                          </Badge>
                        ) : done ? (
                          <Badge variant="green" size="sm">
                            <Check className="size-3" /> {t("resource.installed", "已装")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {tags.map((c) => (
                          <span key={c} className="t-label-12 text-gray-700">
                            {categoryLabel(c)}
                          </span>
                        ))}
                        {tags.length ? <span className="text-gray-600">·</span> : null}
                        <span className="t-label-12 text-gray-700">{environmentLabel(environment)}</span>
                        {hit.author ? <span className="t-label-12 text-gray-700">· {hit.author}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-gray-800">{hit.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={done ? "secondary" : "default"}
                      className="mt-0.5 shrink-0"
                      loading={installing === hit.id}
                      disabled={incompatible}
                      title={incompatible ? t("resource.noCompatFile", "没有适配 {mc} · {type} 的文件", { mc: instance.mcVersion, type: serverTypeLabel(serverType) }) : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        void quickInstall(hit);
                      }}
                    >
                      {incompatible ? t("resource.unavailable", "不可用") : done ? t("resource.reinstall", "重装") : t("resource.install", "安装")}
                    </Button>
                  </div>
                </ContextMenu>
              );
            })}
          </div>
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" loading={loadingMore} onClick={() => void load(hits.length, true)}>
            {t("resource.loadMore", "加载更多")}
          </Button>
        </div>
      ) : null}

      {/* 详情 */}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(v) => {
          if (!v) {
            setSelected(null);
            setProject(null);
            setVersions([]);
          }
        }}
        widthClass="max-w-3xl"
      >
        {selected ? (
          <>
            <DialogHeader
              title={
                <span className="flex items-center gap-2">
                  {zhName ?? selected.title}
                  {zhName ? <span className="t-label-13 font-normal text-gray-700">{selected.title}</span> : null}
                  {selectedDone ? <Badge variant="green" size="sm">{t("resource.installed", "已装")}</Badge> : null}
                </span>
              }
              desc={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{selected.author ? t("resource.byAuthor", "作者 {author}", { author: selected.author }) : "Modrinth"}</span>
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3" /> {formatCount(selected.downloads)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3" /> {formatCount(selected.follows ?? 0)}
                  </span>
                  {selected.license ? <span>{selected.license}</span> : null}
                </span>
              }
            />

            <DialogBody className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                {selected.iconUrl ? (
                  <img src={selected.iconUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-gray-200">
                    <PackageSearch className="size-7 text-gray-700" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {(project?.categories ?? selected.categories).map((c) => (
                      <Badge key={c} variant={c === loader ? "blue" : "gray"} size="sm">
                        {categoryLabel(c)}
                      </Badge>
                    ))}
                    <Badge variant="gray" size="sm">
                      {environmentLabel(environmentOf(selected))}
                    </Badge>
                    {project?.loaders?.slice(0, 4).map((l) => (
                      <Badge key={l} variant="violet" size="sm">
                        {loaderLabel(l)}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {project?.sourceUrl ? (
                      <LinkButton label={t("resource.link.source", "源码")} url={project.sourceUrl} />
                    ) : null}
                    {project?.issuesUrl ? <LinkButton label={t("resource.link.issues", "问题反馈")} url={project.issuesUrl} /> : null}
                    {project?.wikiUrl ? <LinkButton label="Wiki" url={project.wikiUrl} /> : null}
                    <LinkButton label={t("resource.link.modrinth", "Modrinth 页面")} url={`https://modrinth.com/${kind}/${selected.slug}`} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-background-200 p-3">
                <div className="mb-1 flex items-center gap-1.5 t-label-12 text-gray-700">
                  <Tag className="size-3" /> {t("resource.summary", "简介")}
                  {projectZh ? <span className="text-gray-600">{t("resource.zhTranslated", "· 中文由 MCIM 机器翻译")}</span> : null}
                </div>
                {detailLoading && !projectZh ? (
                  <div className="flex items-center gap-2 t-label-13 text-gray-800">
                    <Spinner /> {t("resource.loadingZh", "正在取中文简介…")}
                  </div>
                ) : (
                  <p className="t-label-13 whitespace-pre-wrap leading-6 text-gray-1000">
                    {projectZh ?? project?.description ?? selected.description}
                  </p>
                )}
                {projectZh ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer t-label-12 text-gray-700">{t("resource.showEnglish", "看英文原文")}</summary>
                    <p className="mt-1 t-label-12 text-gray-800">{project?.description ?? selected.description}</p>
                  </details>
                ) : null}
              </div>

              {project?.gallery?.length ? (
                <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin">
                  {project.gallery.slice(0, 5).map((url) => (
                    <button
                      key={url}
                      className="shrink-0 overflow-hidden rounded-lg shadow-geist-border"
                      onClick={() => window.mcss.app.openExternal(url)}
                      title={t("resource.openImage", "在浏览器打开大图")}
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-24 w-40 object-cover transition-transform hover:scale-[1.03]"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                        }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}

              {project?.body ? (
                <details>
                  <summary className="cursor-pointer t-label-13 text-gray-900">
                    {t("resource.fullBody", "完整介绍（英文，来自 Modrinth）")}
                  </summary>
                  <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background-200 p-3 text-[12px] leading-5 text-gray-900 scroll-thin">
                    {project.body}
                  </pre>
                </details>
              ) : null}

              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="t-label-13 font-medium text-gray-1000">{t("resource.versionsFor", "适配 {mc} 的版本", { mc: instance.mcVersion })}</span>
                  <span className="t-label-12 text-gray-700">
                    {loader ? loaderLabel(loader) : t("resource.anyLoader", "不限加载器")} · {t("resource.versionCount", "{n} 个", { n: versions.length })}
                  </span>
                </div>
                {detailLoading ? (
                  <div className="flex items-center gap-2 py-3 t-label-13 text-gray-800">
                    <Spinner /> {t("resource.loadingVersions", "正在查版本…")}
                  </div>
                ) : versions.length === 0 ? (
                  <div className="rounded-lg bg-amber-700/10 p-2.5 t-label-13 text-amber-900">
                    {t("resource.noVersionsDesc", "该项目没有适配当前服务器的版本，可能仅支持其它游戏版本或加载器。")}
                    <button
                      className="ml-2 underline underline-offset-2"
                      onClick={() => window.mcss.app.openExternal(`https://modrinth.com/${kind}/${selected.slug}/versions`)}
                    >
                      {t("resource.seeAllVersions", "去 Modrinth 看全部版本")}
                    </button>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg shadow-geist-border scroll-thin">
                    {versions.slice(0, 40).map((v) => {
                      const file = v.files.find((f) => f.primary) ?? v.files[0];
                      const installedThis = file ? installedFiles.has(file.filename) : false;
                      return (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-300/70 bg-background-100 px-2.5 py-1.5 last:border-0"
                        >
                          <span className="t-mono-12 shrink-0 text-gray-1000">{v.versionNumber}</span>
                          {installedThis ? (
                            <Badge variant="green" size="sm">
                              {t("resource.installed", "已装")}
                            </Badge>
                          ) : null}
                          <span className="t-label-12 min-w-0 flex-1 truncate text-gray-700">
                            {v.gameVersions.slice(0, 3).join(" · ")}
                            {v.loaders.length ? ` · ${v.loaders.map(loaderLabel).join(" / ")}` : ""}
                          </span>
                          <span className="t-label-12 tabular-nums text-gray-700">
                            {new Date(v.datePublished).toLocaleDateString("zh-CN")}
                          </span>
                          <span className="t-label-12 tabular-nums text-gray-700">{file ? formatBytes(file.size) : "—"}</span>
                          <Button
                            size="xs"
                            variant={installedThis ? "secondary" : "default"}
                            loading={installingVersion === v.id}
                            disabled={!file}
                            onClick={() => void installVersion(selected, v, "detail")}
                          >
                            {installedThis ? t("resource.reinstall", "重装") : t("resource.install", "安装")}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {detailError ? <p className="t-label-12 text-red-900">{t("resource.detailPartial", "详情没取全：{msg}", { msg: detailError })}</p> : null}
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                {t("resource.close", "关闭")}
              </Button>
              <Button
                loading={Boolean(installingVersion)}
                disabled={versions.length === 0}
                onClick={() => void installVersion(selected, versions[0], "detail")}
              >
                <Download className="size-4" />
                {t("resource.installLatest", "安装最新版")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      onClick={() => window.mcss.app.openExternal(url)}
      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 t-label-12 text-gray-900 hover:bg-gray-200"
    >
      {label}
      <ExternalLink className="size-3 text-gray-700" />
    </button>
  );
}
