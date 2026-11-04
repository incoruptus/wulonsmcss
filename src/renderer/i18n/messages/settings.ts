import { addMessages } from "../core";

/** settings 组：设置页正文（标题与外观段在 messages/en.ts） */
export const en_settings: Record<string, string> = {
  "common.cancel": "Cancel",
  "settings.mode.host": "I want to host",
  "settings.mode.player": "I want to play",
  "settings.palette.group": "Tea palette",
  "settings.logLimit.label": "Log lines kept",
  "settings.logLimit.hint": "The console and crash diagnosis only keep recent records",
  "settings.logLimit.lines": "{n} lines",
  "settings.motion.label": "Interface motion",
  "settings.motion.hint": "When off, press and popover transitions finish instantly",
  "settings.web.title": "Web version",
  "settings.web.desc":
    "With the local helper running, the web interface can perform real file and server operations.",
  "settings.web.badge": "Web",
  "settings.web.can": "What you can do",
  "settings.web.can.1": "Start and stop servers, console and commands",
  "settings.web.can.2": "Create servers, download popular server software",
  "settings.web.can.3": "Join games, prepare the client and join pack",
  "settings.web.can.4": "World backups, restore and time-machine snapshots",
  "settings.web.can.5": "Mod and plugin scanning, library installs",
  "settings.web.can.6": "Multiplayer and multi-world datapacks",
  "settings.web.can.7": "Java detection and diagnostic bundle export",
  "settings.web.desktopOnly": "Desktop only",
  "settings.web.desktop.1": "Minimize, maximize and close buttons",
  "settings.web.desktop.2": "No local helper needed; just double-click",
  "settings.web.privacy":
    "The local helper listens on 127.0.0.1 only and pairs with a token. It handles local operations and never uploads your server configuration.",
  "settings.about.iconAlt": "Wulon's MCSS",
  "settings.about.brand": "Wulon's MCSS",
  "settings.about.slogan": "Making Minecraft servers a little simpler to run.",
  "settings.about.version": "Version",
  "settings.about.node": "Node",
  "settings.about.dataDir": "Data folder",
  "settings.about.modData": "Mod data",
  "settings.about.openData": "Open data folder",
  "settings.about.resetAll": "Reset all settings",
  "settings.update.title": "Updates",
  "settings.update.desc":
    "The desktop app only downloads the application layer, so updates are small; a full package is only needed when the runtime changes.",
  "settings.credits.title": "Credits",
  "settings.credits.desc":
    "This tool stands on open-source projects, data services and friends.",
  "settings.credits.stack": "Tech stack",
  "settings.credits.services": "Data and services",
  "settings.credits.servicesBody":
    "Modrinth API (mods and modpacks) · MCIM (Chinese summaries) · MCBBS Wiki Chinese names · mcsrvstat.us (public reachability probe) · icanhazip / ipinfo (public IP) · GitHub Gist (cross-device sync).",
  "settings.credits.license": "License",
  "settings.credits.licenseBody":
    "This project is under the ISC license. Third-party licenses for Electron, React, Radix, Lucide and others ship with the installer; the full list is in",
  "settings.author.slogan": "Because we believe, we see.",
  "settings.author.home": "Author page",
  "settings.author.project": "Project page",
  "settings.reset.title": "Reset all settings?",
  "settings.reset.desc":
    "Server list, player records, appearance and sync settings will be cleared.",
  "settings.reset.body":
    "Server files, mods and worlds on disk are not deleted; after resetting, Wulon's MCSS returns to its first-run state.",
  "settings.reset.confirm": "Reset everything",
};

addMessages("en-US", en_settings);
