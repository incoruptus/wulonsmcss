import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Notification {
  id: number
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  details?: string
  timestamp: Date
  dismissed: boolean
}

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const history = ref<Notification[]>([])
  let nextId = 1

  function add(type: Notification['type'], title: string, message: string, details?: string) {
    const n: Notification = {
      id: nextId++,
      type,
      title,
      message,
      details,
      timestamp: new Date(),
      dismissed: false
    }
    notifications.value.push(n)
    history.value.push(n)
    if (history.value.length > 200) {
      history.value = history.value.slice(-200)
    }
    if (type !== 'error') {
      setTimeout(() => dismiss(n.id), 5000)
    }
  }

  function dismiss(id: number) {
    const n = notifications.value.find(n => n.id === id)
    if (n) n.dismissed = true
    setTimeout(() => {
      notifications.value = notifications.value.filter(n => n.id !== id)
    }, 300)
  }

  function clearHistory() {
    history.value = []
  }

  return { notifications, history, add, dismiss, clearHistory }
})