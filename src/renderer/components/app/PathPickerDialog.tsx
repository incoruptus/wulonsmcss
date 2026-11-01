import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  CornerDownLeft,
  File as FileIcon,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { DirEntry } from "@/lib/types";
import { settlePath, usePathPicker } from "@/lib/path-picker";
import { cx } from "@/lib/utils";

interface Drive {
  path: string;
  name: string;
}

interface Place {
  label: string;
  path: string;
}

function separatorOf(path: string): string {
  return path.includes("\\") || /^[a-zA-Z]:/.test(path) ? "\\" : "/";
}

function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = separatorOf(dir);
  return dir.endsWith("\\") || dir.endsWith("/") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  // 已经是盘符根或文件系统根：没有上一级
  if (trimmed === "") return "";
  if (/^[a-zA-Z]:$/.test(trimmed)) return `${trimmed}\\`;
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index < 0) return trimmed;
  // C:\a 的父目录是 C:\，不是 C:
  if (index === 2 && /^[a-zA-Z]:/.test(trimmed)) return `${trimmed.slice(0, 2)}\\`;
  return trimmed.slice(0, index);
}

function baseName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]+/);
  return parts[parts.length - 1] || "";
}

function dirNameOf(path: string): string {
  return path ? parentOf(path) : "";
}

function matchesFilter(name: string, extensions: string[] | undefined): boolean {
  if (!extensions?.length) return true;
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`));
}

function crumbs(path: string): { label: string; path: string }[] {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (!trimmed) return [];
  const parts = trimmed.split(/[\\/]+/);
  const out: { label: string; path: string }[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i += 1) {
    if (i === 0) acc = /^[a-zA-Z]:$/.test(parts[i]) ? `${parts[i]}\\` : parts[i];
    else acc = joinPath(acc, parts[i]);
    out.push({ label: parts[i], path: acc });
  }
  return out;
}

/**
 * 网页版的路径选择器。
 * 不弹系统窗口，也就不存在「点了没反应、窗口跑到浏览器后面」这类问题；
 * 目录内容由本机助手读取，看到的确实是这台电脑上的文件。
 */
export function PathPickerDialog() {
  const pending = usePathPicker((s) => s.pending);
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const alive = useRef(true);
  const loadSeq = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 每次打开都回到调用方给的起点，不残留上一次的目录
  useEffect(() => {
    if (!pending) return;
    setSelected(null);
    setError("");
    setEntries([]);
    setFilename(pending.mode === "save" ? baseName(pending.defaultPath || "") : "");
    setDrives([]);
    setPlaces([]);

    let cancelled = false;
    void (async () => {
      const [ds, info] = await Promise.all([
        (async (): Promise<Drive[]> => {
          try {
            return await window.mcss.fs.drives();
          } catch {
            return [];
          }
        })(),
        window.mcss.app.info().catch(() => null),
      ]);
      if (cancelled) return;
      setDrives(ds);

      const candidates: Place[] = [];
      if (info) {
        const home = info.documents ? parentOf(info.documents) : "";
        if (home) candidates.push({ label: "桌面", path: joinPath(home, "Desktop") });
        if (info.documents) candidates.push({ label: "文档", path: info.documents });
        if (home) candidates.push({ label: "下载", path: joinPath(home, "Downloads") });
        if (info.minecraftDir) candidates.push({ label: ".minecraft", path: info.minecraftDir });
        if (info.appData) candidates.push({ label: "应用数据", path: info.appData });
      }
      const checked = await Promise.all(
        candidates.map(async (p) => ((await window.mcss.fs.exists(p.path).catch(() => false)) ? p : null)),
      );
      if (cancelled) return;
      setPlaces(checked.filter((p): p is Place => Boolean(p)));

      const fallback = pending.defaultPath
        ? pending.mode === "save" || pending.mode === "file"
          ? dirNameOf(pending.defaultPath)
          : pending.defaultPath
        : info?.documents || info?.appData || ds[0]?.path || "C:\\";
      await load(fallback);
    })();

    return () => {
      cancelled = true;
    };
    // load 只依赖当前的 pending；故意不把它放进依赖，避免每次输入都重新列目录
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function load(path: string) {
    const target = path || "C:\\";
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
    let exists = false;
    try {
      exists = await window.mcss.fs.exists(target);
    } catch (e) {
      if (alive.current && seq === loadSeq.current) {
        setError(
          `连不上本机助手，读取不了这台电脑的目录。确认助手已启动后刷新页面；如果浏览器问是否允许访问本地网络，请点允许。(${(e as Error).message})`,
        );
      }
      return;
    }
    if (seq !== loadSeq.current) return;
    if (!exists) {
      if (alive.current) {
        setError("这个路径不存在，或者没有权限读取。可以从左侧的磁盘和常用位置重新进。");
        setTyped(target);
      }
      return;
    }
      const list = await window.mcss.fs.list(target);
      if (!alive.current || seq !== loadSeq.current) return;
      setDir(target);
      setTyped(target);
      setEntries(list);
      setSelected(null);
    } catch (e) {
      if (alive.current && seq === loadSeq.current) setError((e as Error).message || "读取目录失败");
    } finally {
      if (alive.current && seq === loadSeq.current) setLoading(false);
    }
  }

  const visible = useMemo(() => {
    if (!pending) return [];
    const list = entries.filter((entry) => {
      if (entry.isDir) return true;
      // 选目录时文件只作为「这里是什么」的参照，不能点；保存时只列目录
      if (pending.mode === "dir") return true;
      if (pending.mode === "save") return false;
      return matchesFilter(entry.name, pending.filters?.[0]?.extensions);
    });
    list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" });
    });
    return list.slice(0, 800);
  }, [entries, pending]);

  if (!pending) return null;

  const title =
    pending.title ||
    (pending.mode === "dir" ? "选择文件夹" : pending.mode === "save" ? "保存到" : "选择文件");
  const confirmLabel =
    pending.confirmLabel || (pending.mode === "dir" ? "选择这个文件夹" : pending.mode === "save" ? "保存" : "选择");
  const canConfirm =
    pending.mode === "dir" ? Boolean(dir) : pending.mode === "file" ? Boolean(selected) : Boolean(dir && filename.trim());
  const trail = crumbs(dir);

  function confirm() {
    if (!canConfirm) return;
    if (pending?.mode === "dir") settlePath(dir);
    else if (pending?.mode === "file") settlePath(selected);
    else {
      const name = filename.trim();
      if (/[<>:"/\\|?*\u0000-\u001F]/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) {
        setError("这个文件名在 Windows 上不能用，换一个名字。");
        return;
      }
      settlePath(joinPath(dir, name));
    }
  }

  function openEntry(entry: DirEntry) {
    if (entry.isDir) {
      void load(entry.path);
      return;
    }
    if (pending?.mode !== "file") return;
    setSelected(entry.path);
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? settlePath(null) : undefined)} widthClass="max-w-3xl">
      <DialogHeader
        title={title}
        desc={
          pending.mode === "dir"
            ? "在这台电脑上点进目标文件夹，然后确认。列表由本机助手读取，看到的就是实际内容。"
            : pending.mode === "file"
              ? "点一下文件即可选中；双击直接确认。"
              : "先选保存位置，再填文件名。"
        }
      />
      <DialogBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => void load(parentOf(dir))} disabled={!dir || loading} title="上一级">
            <ArrowUp className="size-3.5" />
          </Button>
          <Button size="xs" variant="ghost" onClick={() => void load(dir)} disabled={!dir || loading} title="刷新">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 rounded-lg bg-background-200 px-2 py-1">
            {trail.length === 0 ? (
              <span className="t-label-12 text-gray-700">选择磁盘</span>
            ) : (
              trail.map((item, index) => (
                <span key={item.path} className="flex min-w-0 items-center">
                  {index > 0 ? <ChevronRight className="size-3 shrink-0 text-gray-600" /> : null}
                  <button
                    type="button"
                    onClick={() => void load(item.path)}
                    className="max-w-[150px] truncate rounded px-1 t-label-12 text-gray-900 hover:bg-gray-100"
                    title={item.path}
                  >
                    {item.label}
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[152px_minmax(0,1fr)]">
          <div className="min-h-0 space-y-1 overflow-y-auto rounded-lg bg-background-200 p-1.5 scroll-thin sm:max-h-72">
            {drives.map((drive) => (
              <button
                key={drive.path}
                type="button"
                onClick={() => void load(drive.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left t-label-12 text-gray-900 hover:bg-gray-100"
              >
                <HardDrive className="size-3.5 shrink-0 text-gray-700" />
                <span className="truncate">{drive.name}</span>
              </button>
            ))}
            {places.length ? <div className="my-1 h-px bg-gray-300" /> : null}
            {places.map((place) => (
              <button
                key={place.path}
                type="button"
                onClick={() => void load(place.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left t-label-12 text-gray-900 hover:bg-gray-100"
                title={place.path}
              >
                <Folder className="size-3.5 shrink-0 text-gray-700" />
                <span className="truncate">{place.label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-[220px] overflow-y-auto rounded-lg bg-background-200 p-1.5 scroll-thin sm:max-h-72">
            {loading ? (
              <div className="grid h-24 place-items-center t-label-12 text-gray-700">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : error ? (
              <div className="space-y-2 p-3">
                <p className="t-label-12 leading-5 text-amber-900">{error}</p>
                <Button size="xs" variant="secondary" onClick={() => window.location.reload()}>
                  刷新页面
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <p className="p-3 t-label-12 text-gray-700">这个文件夹是空的。</p>
            ) : (
              visible.map((entry) => {
                const isSelected = selected === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => openEntry(entry)}
                    aria-pressed={isSelected}
                    onDoubleClick={() => {
                      if (!entry.isDir && pending.mode === "file") {
                        setSelected(entry.path);
                        settlePath(entry.path);
                      } else if (entry.isDir) {
                        void load(entry.path);
                      }
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      isSelected ? "bg-gray-100 shadow-geist-border" : "hover:bg-gray-100",
                      !entry.isDir && pending.mode === "dir" ? "opacity-45" : "",
                    )}
                    title={entry.path}
                  >
                    {entry.isDir ? (
                      <Folder className="size-4 shrink-0 text-brand-700" />
                    ) : (
                      <FileIcon className="size-4 shrink-0 text-gray-700" />
                    )}
                    <span className="min-w-0 flex-1 truncate t-label-13 text-gray-1000">{entry.name}</span>
                    {entry.isDir ? <ChevronRight className="size-3.5 shrink-0 text-gray-600" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {pending.mode === "save" ? (
          <div className="flex items-center gap-2">
            <span className="t-label-12 shrink-0 text-gray-700">文件名</span>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="保存文件名" />
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void load(typed);
              }
            }}
            className="font-mono text-[12px]"
            placeholder="也可以直接粘贴完整路径后回车"
            aria-label="路径"
          />
          <Button size="sm" variant="secondary" onClick={() => void load(typed)} disabled={!typed.trim() || loading}>
            <CornerDownLeft className="size-3.5" />
            前往
          </Button>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={() => settlePath(null)}>
          取消
        </Button>
        <Button onClick={confirm} disabled={!canConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
