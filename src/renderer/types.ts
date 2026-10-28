/**
 * 仪表盘「快捷操作」的共享类型。
 * Dashboard / AddActionDialog / EditActionsDialog 三处必须一致，
 * 否则保存时会把 path / section 丢掉。
 */
export interface QuickAction {
  id: string
  name: string
  icon: string
  /** path = 打开目录或文件；section = 跳转到某个页面 / 设置区块 */
  type?: 'path' | 'section'
  path?: string
  section?: string
  page?: string
  /** 内置操作：不可删除、不可拖动 */
  isDefault?: boolean
}
