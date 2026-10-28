/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAPI {
  env: { APPDATA: string; USERNAME: string }
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  startServer: (javaPath: string, serverDir: string, jvmArgs?: string) => Promise<void>
  stopServer: () => Promise<void>
  sendCommand: (cmd: string) => Promise<void>
  getServerStatus: () => Promise<string>
  getServerMemory: () => Promise<number>
  openPath: (filePath: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  readDir: (dirPath: string) => Promise<string[]>
  readServerProperties: (filePath: string) => Promise<Record<string, string>>
  writeServerProperties: (filePath: string, props: Record<string, string>) => Promise<void>
  deleteFile: (filePath: string) => Promise<void>
  readModMeta: (jarPath: string) => Promise<any>
  generateManifest: (serverDir: string) => Promise<any>
  copyWallpaper: (src: string) => Promise<{ path: string; dataUrl: string; brightness: number }>
  analyzeWallpaper: (filePath: string) => Promise<{ brightness: number }>
  readWallpaper: (filePath: string) => Promise<string | null>
  copyServerIcon: (src: string, serverDir: string) => Promise<void>
  startFrp: (config: any) => Promise<any>
  stopFrp: () => Promise<void>
  readConfig: () => Promise<any>
  writeConfig: (data: any) => Promise<void>
  clearCache: () => Promise<void>
  getDataPath: () => Promise<string>
  openFileDialog: (filters?: any) => Promise<string | null>
  saveFileDialog: (opts?: any) => Promise<string | null>
  openDirectoryDialog: () => Promise<string | null>
  onServerOutput: (cb: (data: any) => void) => void
  onServerStatus: (cb: (status: string) => void) => void
  scanWorlds: (serverDir: string) => Promise<any[]>
  createWorld: (serverDir: string, worldConfig: any) => Promise<{ success: boolean; error?: string }>
  deleteWorld: (serverDir: string, packName: string) => Promise<{ success: boolean; error?: string }>
  reloadWorlds: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}