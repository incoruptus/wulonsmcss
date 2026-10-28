// Ripple directive — adds Material ripple effect on click
import type { Directive } from 'vue'

const RIPPLE_CLASS = 'ripple-container'

export const vRipple: Directive = {
  mounted(el: HTMLElement) {
    if (!el.classList.contains(RIPPLE_CLASS)) {
      el.classList.add(RIPPLE_CLASS)
      el.style.position = el.style.position || 'relative'
    }
    el.addEventListener('click', createRipple)
  },
  unmounted(el: HTMLElement) {
    el.removeEventListener('click', createRipple)
  }
}

function createRipple(this: HTMLElement, e: MouseEvent) {
  const rect = this.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2
  const ripple = document.createElement('span')
  ripple.className = 'ripple-effect'
  ripple.style.width = ripple.style.height = size + 'px'
  ripple.style.left = x + 'px'
  ripple.style.top = y + 'px'
  this.appendChild(ripple)
  ripple.addEventListener('animationend', () => ripple.remove())
}