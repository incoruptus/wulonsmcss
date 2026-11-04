import { addMessages } from "../core";

/** ui 组：通用控件文案 + 联机页网络体检 */
export const en_ui: Record<string, string> = {
  // 通用控件
  "common.loading": "Loading",
  "common.breadcrumb": "Breadcrumb",
  "common.close": "Close",
  "common.select": "Select…",
  "settings.syncing": "Syncing to the cloud",

  // 网络体检
  "netdoctor.title": "Can friends get in?",
  "netdoctor.subtitle": "Check first, then follow the next step below",
  "netdoctor.recheck": "Check again",
  "netdoctor.checking": "Checking…",
  "netdoctor.checkingDetail": "Checking your network. This takes a few seconds…",
  "netdoctor.next.direct": "Next: send this direct address to your friend",
  "netdoctor.next.relay": "Next: set up a relay",
  "netdoctor.next.port": "Next: open a port or use a relay",
  "netdoctor.directAddress": "direct address",
  "netdoctor.copyAddress": "Copy address",
  "netdoctor.switchRelay": "Can't connect? Try a relay",
  "netdoctor.openRelay": "Set up a relay",
  "netdoctor.hint.direct":
    "Have your friend paste the line below into Minecraft Direct Connect. Send it after the server starts; if they cannot connect, use “Try a relay”.",
  "netdoctor.hint.symmetric":
    "Your network cannot accept outside connections directly. Set up a relay below and send the assigned address to your friend.",
  "netdoctor.hint.upnp":
    "Your router supports opening ports automatically. Open the port below, then send the address to your friend.",
  "netdoctor.hint.none":
    "There is no direct address right now. Set up a relay below and send the assigned address to your friend.",
  "netdoctor.details": "Technical details: addresses and network type",
  "netdoctor.lan": "This machine",
  "netdoctor.publicV4": "Public IPv4",
  "netdoctor.publicV6": "Public IPv6",
  "netdoctor.nat": "NAT",
  "netdoctor.upnp": "Router UPnP",
  "netdoctor.stun": "STUN mapping",
  "netdoctor.notFound": "Not found",
  "netdoctor.noV4": "Not available",
  "netdoctor.noV6": "None",
  "netdoctor.nat.cone": "Cone (hole punching works)",
  "netdoctor.nat.symmetric": "Symmetric (relay only)",
  "netdoctor.nat.unknown": "Not detected",
  "netdoctor.upnp.available": "Available",
  "netdoctor.upnp.externalIp": " · external IP {ip}",
  "netdoctor.upnp.unavailable": "Unavailable",
  "netdoctor.upnp.mappedHint": "Open: friends connect via {addr}",
  "netdoctor.upnp.offer":
    "Open a port on the router so friends can connect directly. Only one rule is added and it can be undone.",
  "netdoctor.upnp.unmap": "Undo mapping",
  "netdoctor.upnp.map": "Open port on router",
  "netdoctor.ifaces": "{n} local addresses",
  "netdoctor.ifacesVirtual": " ({n} virtual adapters)",
  "netdoctor.virtual": "Virtual",
  "netdoctor.copyLabel": "Copy {label}",
  "netdoctor.copied": "Copied {label}",
  "netdoctor.copiedHint":
    "Send it to your friend and have them paste it into Minecraft Direct Connect",
  "netdoctor.copyFailed": "Copy failed — select the address manually",
  "netdoctor.publicIp": "public IP",
  "netdoctor.upnp.confirm":
    "This will map TCP port {port} to {lan}:{port} on your router, so players can connect through your public address.\n\nOnly this one TCP rule is added and it can be undone. Changing networks or restarting the router may require enabling it again. Continue?",
  "netdoctor.upnp.refused": "The router refused the mapping",
  "netdoctor.upnp.mapped": "Port mapped",
  "netdoctor.upnp.mapFailed": "Mapping failed",
  "netdoctor.upnp.unmapRefused": "The router refused to undo the mapping",
  "netdoctor.upnp.unmapped": "Port mapping undone",
  "netdoctor.upnp.unmapFailed": "Undo failed",

  // 网络体检结论
  "netdoctor.advice.none.title": "Not checked yet",
  "netdoctor.advice.none.detail": "Run a check to see whether friends can get in right now.",
  "netdoctor.advice.direct.title": "Direct connection looks possible",
  "netdoctor.advice.direct.detail":
    "A direct address was found. Send it to a friend and try; if that fails, switch to a relay.",
  "netdoctor.advice.relay.title": "Friends cannot get in directly",
  "netdoctor.advice.relay.detail":
    "Your network does not accept outside connections. Use the relay below so friends can come in.",
  "netdoctor.advice.upnp.title": "Direct connection may work",
  "netdoctor.advice.upnp.detail":
    "Your router can open a port automatically. Open it below, then send the address to your friend.",
  "netdoctor.advice.manual.title": "You need to open a port manually",
  "netdoctor.advice.manual.detail":
    "The router did not respond to automatic port opening. Set it up in the router admin page, or use a relay.",
  "netdoctor.advice.port.title": "The router can open the port automatically",
  "netdoctor.advice.port.detail":
    "Open the port below and send the address to your friend; if it still fails, use a relay.",
  "netdoctor.advice.unknown.title": "Not determined yet",
  "netdoctor.advice.unknown.detail": "Run the check again, or just use a relay.",

  // 可达性结论（服主 / 玩家共用）
  "reach.host.public.title": "Friends can get in",
  "reach.host.public.detail": "This address is reachable from the internet. Send it to your friend.",
  "reach.host.tunnel.title": "Friends can get in through a relay",
  "reach.host.tunnel.detail":
    "This route adds one relay hop. If a direct address works, prefer it.",
  "reach.host.lan.title": "Only the same network can get in",
  "reach.host.lan.detail":
    "Friends on the same Wi-Fi can join; friends outside need a relay.",
  "reach.host.local.title": "Friends still cannot get in",
  "reach.host.local.detail":
    "The server only accepts local connections. Check whether it is bound to 127.0.0.1, or whether the firewall blocks Java.",
  "reach.host.offline.title": "The server is not responding",
  "reach.host.offline.detail": "Start the server, wait for it to finish loading, then check again.",
  "reach.host.unknown.title": "Not checked yet",
  "reach.host.unknown.detail": "Run a check to see whether friends can get in right now.",
  "reach.player.ready.title": "Server is online",
  "reach.player.ready.detail": "Connected to the server; you can join the game.",
  "reach.player.offline.title": "The server is not responding",
  "reach.player.offline.detail":
    "All addresses were tried. The server may be stopped, or you may not be on the same network.",
  "reach.player.unknown.title": "Not probed yet",
  "reach.player.unknown.detail": "Checking the server status.",
  "reach.kind.local": "This machine",
  "reach.kind.lan": "Same network",
  "reach.kind.ipv6": "Direct",
  "reach.kind.public": "Direct",
  "reach.kind.tunnel": "Relay",
  "reach.kind.manual": "Manual address",
  "reach.kind.address": "Address",
  "reach.probe.unknown": "Cannot probe",
  "reach.probe.ok": "Reachable",
  "reach.probe.okWithMs": "Reachable · {ms}ms",
  "reach.probe.failed": "Cannot connect",

  // 玩家诊断的下一步建议
  "diag.next.noAddr.title": "The invite has no usable address",
  "diag.next.noAddr.detail": "Have your friend send a new invite, or generate a new one on the multiplayer page.",
  "diag.next.offline.title": "Your friend has not connected",
  "diag.next.offline.detail":
    "Make sure the server is running. If it is, set up a relay on the multiplayer page and send the new address.",
  "diag.next.reDiagnose.title": "Ask your friend to send the diagnosis again",
  "diag.next.reDiagnose.detail":
    "The network works, but their client information was not read this time. Ask them to press “Copy diagnosis” again on the join page.",
  "diag.next.needMods.title": "Ask your friend to install the missing mods",
  "diag.next.needMods.detail":
    "The network works, but your friend is missing {n} mods. Send them the join pack, or have them install the same mods.",
  "diag.next.needVersion.title": "Ask your friend to use the matching version",
  "diag.next.needVersion.detail":
    "The network works, but your friend does not have this version and loader. Have them use the join pack, or install the same version as the server.",
  "diag.next.noClient.title": "Your friend has not set up the game",
  "diag.next.noClient.detail":
    "The network works, but no usable Minecraft was found on their machine. Ask them to install Java Edition and sign in, then try again.",
  "diag.next.auth.title": "Check online-mode and the whitelist",
  "diag.next.auth.detail":
    "The network and client are fine. Confirm the server does not require online-mode and that your friend is on the whitelist, then have them join again.",
  "diag.next.fallback.title": "Ask your friend to try again",
  "diag.next.fallback.detail":
    "The network works; the client needs a closer look. Ask them to copy the diagnosis again, or send the in-game error.",
  "diag.headline.none": "The player could not reach any address. Check the server status and the relay first.",
  "diag.headline.noProbe": "The player found no address to probe. The invite may be malformed.",
  "diag.headline.noClientInfo": "The network works, but the player's client information was not read.",
  "diag.headline.ready": "Network and client are fine. The problem may be online-mode or the whitelist.",
  "diag.headline.needMods": "The network works, but the player is missing {n} mods.",
  "diag.headline.needVersion": "The network works, but the player has no server for that version and loader.",
  "diag.headline.noClient": "The network works, but that player has no usable client on their machine.",
  "diag.headline.fallback": "The network works; the client still needs a closer look.",

  // 进服包打包进度（stage 由主进程给出，前端按 key 取词）
  "join.stage.preparing": "Preparing {label}",
  "join.stage.done": "Done",

  // 机翻对话框
  "translate.title": "Translate",
  "translate.chars": "{n} characters · {engine}",
  "translate.source": "Original",
  "translate.result": "Translation",
  "translate.truncated": " (only the first 3000 characters were translated)",
  "translate.translating": "Translating…",
  "translate.retry": "Retry",
  "translate.retranslate": "Translate again",
  "translate.copied": "Translation copied",
  "translate.copyFailed": "Copy failed",
  "translate.copy": "Copy translation",
  "translate.close": "Close",
  "translate.engine.none": "no translation needed",
  "translate.engine.machine": "machine translation",
};

addMessages("en-US", en_ui);
