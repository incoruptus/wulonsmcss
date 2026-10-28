import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  stack?: string
}

export const useServerStore = defineStore('server', () => {
  const status = ref<'stopped' | 'running' | 'starting'>('stopped')
  const logs = ref<LogEntry[]>([])
  const maxLogs = 1000
  const tps = ref(20.0)
  const onlinePlayers = ref<string[]>([])
  const maxPlayers = ref(20)
  const uptime = ref(0)
  const memoryUsage = ref({ used: 0, max: 4 * 1024 * 1024 * 1024 })
  let uptimeInterval: any = null

  function addLog(entry: LogEntry) {
    logs.value.push(entry)
    if (logs.value.length > maxLogs) {
      logs.value = logs.value.slice(-maxLogs)
    }
  }

  function clearLogs() {
    logs.value = []
  }

  function startUptime() {
    if (uptimeInterval) return
    uptimeInterval = setInterval(() => { uptime.value++ }, 1000)
  }

  function stopUptime() {
    if (uptimeInterval) {
      clearInterval(uptimeInterval)
      uptimeInterval = null
    }
  }

  function setServerStatus(s: string) {
    if (s === 'running') {
      if (status.value === 'running') return // already running
      status.value = 'running'
      uptime.value = 0
      startUptime()
    } else if (s === 'starting') {
      if (status.value === 'starting') return
      status.value = 'starting'
      stopUptime()
      uptime.value = 0
    } else {
      if (status.value === 'stopped') return // already stopped
      status.value = 'stopped'
      stopUptime()
      uptime.value = 0
    }
  }

  // Wire up IPC events
  if (window.electronAPI) {
    window.electronAPI.onServerOutput((entry: LogEntry) => {
      addLog(entry)

      // Parse online players from log
      const joinMatch = entry.message.match(/(\w+) joined the game/)
      if (joinMatch && !onlinePlayers.value.includes(joinMatch[1])) {
        onlinePlayers.value.push(joinMatch[1])
      }
      const leaveMatch = entry.message.match(/(\w+) left the game/)
      if (leaveMatch) {
        onlinePlayers.value = onlinePlayers.value.filter(p => p !== leaveMatch[1])
      }

      // Parse TPS
      const tpsMatch = entry.message.match(/Overall TPS: ([\d.]+)/)
      if (tpsMatch) tps.value = parseFloat(tpsMatch[1])

      // Track server running
      if (entry.message.includes('Done (') && entry.message.includes(')!')) {
        setServerStatus('running')
      }
    })

    window.electronAPI.onServerStatus((s: string) => {
      setServerStatus(s)
    })

    // Check initial status
    window.electronAPI.getServerStatus().then((s: string) => {
      if (s !== 'stopped') setServerStatus(s)
    }).catch(() => {})
  }

  return { status, logs, maxLogs, tps, onlinePlayers, maxPlayers, uptime, memoryUsage, addLog, clearLogs, setServerStatus }
})