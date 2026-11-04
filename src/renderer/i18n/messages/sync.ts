import { addMessages } from "../core";

/** sync 组：跨端同步的错误与状态文案（非组件代码通过 tGlobal 取词） */
export const en_sync: Record<string, string> = {
  "sync.error.noDecompress": "This environment cannot decompress the sync payload",
  "sync.error.noCrypto": "This environment cannot encrypt",
  "sync.error.badPair": "The pair code is wrong, or the sync payload is damaged",
  "sync.error.noToken": "GitHub token is missing",
  "sync.error.noPairCode":
    "The pair code is not ready yet. Generate one, or paste the code from your other device.",
  "sync.error.failed": "Sync failed",
  // sync.phase.syncing 在 app.ts（SyncCard 在用），这里不重复登记
  "sync.result.bits": "Added {added} · Updated {updated} · Removed {deleted}",
  "sync.result.doneWith": "Sync complete · {detail}",
  "sync.result.done": "Sync complete",
  "sync.result.upToDate": "Already up to date",
  "sync.chunk.badManifest": "The sync chunk manifest is malformed",
  "sync.chunk.incomplete":
    "The sync payload is incomplete: {n} chunks are missing. The other device may still be uploading.",
  "sync.chunk.checksum": "Sync chunk checksum mismatch. Try syncing again later.",
  "sync.github.timeout": "Connecting to GitHub timed out. Try again later.",
  "sync.github.unreachable": "Cannot reach GitHub. Check your network or proxy settings.",
  "sync.github.unparsable": "GitHub returned content that could not be parsed",
  "sync.pack.badJson": "This file is not a sync package — JSON parsing failed",
  "sync.pack.notOurs": "This file is not a Wulon's MCSS sync package",
  "sync.pack.fromNewer": "This sync package comes from a newer version. Update the app first.",
  "sync.pack.incomplete": "The sync package is incomplete",
  "sync.pack.checksum": "The sync package checksum does not match; the transfer may be truncated",
  "sync.pack.undecodable": "The sync payload could not be decoded",
  "sync.pack.unparsable": "The sync payload could not be parsed",
};

addMessages("en-US", en_sync);
