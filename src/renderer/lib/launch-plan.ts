/**
 * 启动计划生成器（纯逻辑）
 * ------------------------------------------------------------
 * 只做一件事：把「玩家已经装好的版本」翻译成一条 java 启动命令。
 * 不下载、不写文件、不改 .minecraft —— 所有 I/O 都通过注入的 exists()。
 *
 * 设计取舍见 docs/LAUNCH-DESIGN.md。
 */

import { tGlobal } from "../i18n/core";

export type Platform = "windows" | "macos" | "linux";

export interface Rule {
  action: "allow" | "deny";
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}

export interface Library {
  name: string;
  rules?: Rule[];
  natives?: Record<string, string>;
  downloads?: { artifact?: { path?: string; url?: string; size?: number } };
  extract?: { exclude?: string[] };
}

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  mainClass?: string;
  libraries?: Library[];
  arguments?: { game?: (string | { rules?: Rule[]; value: string | string[] })[]; jvm?: (string | { rules?: Rule[]; value: string | string[] })[] };
  minecraftArguments?: string;
  assetIndex?: { id?: string };
  assets?: string;
  type?: string;
}

export interface LaunchContext {
  /** 合并后的版本 JSON（已解析继承） */
  version: VersionJson;
  /** .minecraft 根目录 */
  gameDir: string;
  /** 版本目录（含 <id>.jar） */
  versionDir: string;
  /** 玩家名（离线登录） */
  username: string;
  javaPath: string;
  memoryGb: { min: number; max: number };
  platform: Platform;
  arch?: "x86_64" | "x86" | "arm64";
  /** 文件是否存在（注入，便于测试） */
  exists: (path: string) => Promise<boolean>;
  /** natives 解压目录 */
  nativesDir: string;
  server?: { host: string; port: number };
}

export interface LaunchPlan {
  command: string[];
  /** 缺失的库文件（相对 libraries 的路径） */
  missing: string[];
  warnings: string[];
}

const SEP = "\\";

function joinPath(...parts: string[]): string {
  return parts.join(SEP).replace(/\\+/g, "\\");
}

/** Maven 坐标 net.fabricmc:fabric-loader:0.20.1 → libraries/net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar */
export function mavenToPath(name: string): string | null {
  const [group, artifact, version, classifier] = name.split(":");
  if (!group || !artifact || !version) return null;
  const dir = `${group.replace(/\./g, "/")}/${artifact}/${version}`;
  const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`;
  return `${dir.replace(/\//g, SEP)}${SEP}${file}`;
}

function osName(platform: Platform): string {
  return platform === "windows" ? "windows" : platform === "macos" ? "osx" : "linux";
}

/** 规则求值：默认允许，命中的 deny 否决；只有 allow 命中才算允许 */
export function rulesAllow(rules: Rule[] | undefined, platform: Platform, arch: string): boolean {
  if (!rules?.length) return true;
  let allowed = false;
  for (const rule of rules) {
    const osMatches =
      !rule.os ||
      ((rule.os.name ? rule.os.name === osName(platform) : true) && (rule.os.arch ? rule.os.arch === arch : true));
    // features 这里一律按 false 处理（没有 demo/quickPlay 之类）
    const featuresMatch = !rule.features || Object.values(rule.features).every((v) => v === false);
    if (osMatches && featuresMatch) {
      if (rule.action === "deny") return false;
      allowed = true;
    }
  }
  return allowed;
}

/** 合并子版本与父版本：主类与参数以子为准，库取并集（子在前，后加载覆盖） */
export function mergeVersions(base: VersionJson | null, child: VersionJson): VersionJson {
  if (!base) return child;
  const seen = new Set<string>();
  const libraries: Library[] = [];
  for (const lib of [...(child.libraries ?? []), ...(base.libraries ?? [])]) {
    if (seen.has(lib.name)) continue;
    seen.add(lib.name);
    libraries.push(lib);
  }
  return {
    ...base,
    ...child,
    id: child.id,
    inheritsFrom: undefined,
    mainClass: child.mainClass ?? base.mainClass,
    assetIndex: child.assetIndex ?? base.assetIndex,
    assets: child.assets ?? base.assets,
    libraries,
    arguments: {
      game: [...(base.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(base.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
    },
    minecraftArguments: child.minecraftArguments ?? base.minecraftArguments,
  };
}

function flattenArgs(items: (string | { rules?: Rule[]; value: string | string[] })[] | undefined, platform: Platform, arch: string): string[] {
  const out: string[] = [];
  for (const item of items ?? []) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (!rulesAllow(item.rules, platform, arch)) continue;
    out.push(...(Array.isArray(item.value) ? item.value : [item.value]));
  }
  return out;
}

function subst(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{([a-z_]+)\}/gi, (whole, key: string) => vars[key] ?? whole);
}

/**
 * 生成启动计划。
 * 缺文件不会抛错，而是记在 missing 里——调用方据此决定「直接进游戏」还是「退回进服包」。
 */
export async function buildLaunchPlan(ctx: LaunchContext): Promise<LaunchPlan> {
  const { version, platform } = ctx;
  const arch = ctx.arch ?? "x86_64";
  const librariesDir = joinPath(ctx.gameDir, "libraries");
  const warnings: string[] = [];
  const missing: string[] = [];
  const classpath: string[] = [];

  for (const lib of version.libraries ?? []) {
    if (!rulesAllow(lib.rules, platform, arch)) continue;

    // 老版本的 natives 分类器（新版本会把 natives 作为独立库，同样走 downloads.artifact）
    const nativeClassifier = lib.natives?.[osName(platform)];
    if (nativeClassifier) {
      const nativeName = `${lib.name}:${nativeClassifier.replace("${arch}", arch === "x86" ? "32" : "64")}`;
      const rel = mavenToPath(nativeName);
      if (rel) {
        const full = joinPath(librariesDir, rel);
        if (!(await ctx.exists(full))) missing.push(rel);
        else classpath.push(full);
      }
      continue;
    }

    const rel = lib.downloads?.artifact?.path ?? mavenToPath(lib.name);
    if (!rel) {
      warnings.push(tGlobal("launchPlan.warnUnknownLib", "看不懂的库坐标：{name}", { name: lib.name }));
      continue;
    }
    const full = joinPath(librariesDir, rel);
    if (await ctx.exists(full)) classpath.push(full);
    else missing.push(rel);
  }

  // 版本自身的 jar（继承时在父版本目录里）
  const clientJar = joinPath(ctx.versionDir, `${version.id}.jar`);
  if (await ctx.exists(clientJar)) classpath.push(clientJar);
  else missing.push(`${version.id}.jar`);

  const vars: Record<string, string> = {
    auth_player_name: ctx.username,
    version_name: version.id,
    game_directory: ctx.gameDir,
    assets_root: joinPath(ctx.gameDir, "assets"),
    assets_index_name: version.assetIndex?.id ?? version.assets ?? "legacy",
    natives_directory: ctx.nativesDir,
    library_directory: librariesDir,
    classpath: classpath.join(";"),
    classpath_separator: ";",
    launcher_name: "WulonsMCSS",
    launcher_version: "27",
    user_type: "legacy",
    version_type: version.type ?? "release",
  };

  const jvm: string[] = [];
  jvm.push(`-Xms${ctx.memoryGb.min}G`, `-Xmx${ctx.memoryGb.max}G`);
  jvm.push(`-Djava.library.path=${ctx.nativesDir}`);
  jvm.push(...flattenArgs(version.arguments?.jvm, platform, arch).map((a) => subst(a, vars)));
  if (!jvm.some((a) => a === "-cp" || a === "-classpath")) {
    jvm.push("-cp", subst("${classpath}", vars));
  }

  let game: string[];
  if (version.arguments?.game?.length) {
    game = flattenArgs(version.arguments.game, platform, arch).map((a) => subst(a, vars));
  } else if (version.minecraftArguments) {
    game = version.minecraftArguments.split(/\s+/).map((a) => subst(a, vars));
  } else {
    game = ["--username", ctx.username, "--gameDir", ctx.gameDir, "--version", version.id];
    warnings.push(tGlobal("launchPlan.warnMinimalArgs", "版本 JSON 没有参数，使用最小参数集"));
  }

  // 直接把游戏开进服务器
  if (ctx.server) {
    game.push("--server", ctx.server.host, "--port", String(ctx.server.port));
  }

  const command = [ctx.javaPath, ...jvm, version.mainClass ?? "net.minecraft.client.main.Main", ...game];

  if (missing.length) {
    warnings.push(tGlobal("launchPlan.warnMissingFiles", "缺少 {n} 个文件，通常通过启动器打开一次游戏即可补齐", { n: missing.length }));
  }

  return { command, missing, warnings };
}
