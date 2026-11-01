/**
 * 选路径的唯一入口
 * ------------------------------------------------------------
 * 桌面版直接用系统对话框；网页版没有 `dialog` 能力，就在页面里画一个文件浏览器。
 * 这样每个「选择…」按钮在两种外壳下都真的能用，不用让用户自己往输入框里粘路径。
 */
import { create } from "zustand";
import { detectShell } from "./shell";

export type PathPickMode = "dir" | "file" | "save";

export interface PathFilter {
  name: string;
  extensions: string[];
}

export interface PathPickRequest {
  mode: PathPickMode;
  title?: string;
  /** 初始位置（目录，或带文件名的保存路径） */
  defaultPath?: string;
  filters?: PathFilter[];
  confirmLabel?: string;
}

interface PendingPick extends PathPickRequest {
  resolve: (value: string | null) => void;
}

interface PathPickerState {
  pending: PendingPick | null;
}

export const usePathPicker = create<PathPickerState>(() => ({ pending: null }));

export function pickPath(request: PathPickRequest): Promise<string | null> {
  if (detectShell() === "electron") {
    if (request.mode === "dir") return window.mcss.dialog.openDirectory();
    if (request.mode === "file") return window.mcss.dialog.openFile(request.filters);
    return window.mcss.dialog.saveFile({ defaultPath: request.defaultPath, filters: request.filters });
  }
  return new Promise((resolve) => {
    const previous = usePathPicker.getState().pending;
    if (previous) previous.resolve(null);
    usePathPicker.setState({ pending: { ...request, resolve } });
  });
}

/** 交给界面层收尾：无论确认还是取消，Promise 都必须落地，不能悬着 */
export function settlePath(value: string | null): void {
  const pending = usePathPicker.getState().pending;
  if (!pending) return;
  usePathPicker.setState({ pending: null });
  pending.resolve(value);
}
