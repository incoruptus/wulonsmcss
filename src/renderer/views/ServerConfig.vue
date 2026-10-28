<template>
  <div class="config-view">
    <div class="page-header">
      <h1 class="page-title">服务器配置</h1>
      <div class="header-actions">
        <SegmentedButton
          :options="[
            { value: 'form', label: '表单模式', icon: 'list_alt' },
            { value: 'raw', label: '原始模式', icon: 'code' }
          ]"
          v-model="mode"
        />
        <md-outlined-button @click="resetConfig">
          <md-icon slot="icon">restart_alt</md-icon>
          重置
        </md-outlined-button>
        <md-filled-button @click="saveConfig">
          <md-icon slot="icon">save</md-icon>
          保存配置
        </md-filled-button>
      </div>
    </div>

    <div class="tab-slide-wrap" style="flex:1">
    <transition :name="transName" mode="out-in">
      <div v-if="mode === 'form'" class="form-mode anim-stagger" key="form">
        <section id="section-basic" class="config-section">
          <h2 class="section-title">基础信息</h2>
          <div class="form-grid">
            <div class="form-field">
              <md-outlined-text-field v-model="config.motd" label="服务器名称 (MOTD)" type="text"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.description" label="服务器简介" type="textarea" multiline rows="3"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <label class="field-label">服务器图标</label>
              <div class="icon-picker">
                <div class="icon-preview" :style="iconPreviewStyle"></div>
                <md-outlined-button @click="selectIcon">选择图片</md-outlined-button>
              </div>
            </div>
            <div class="form-field">
              <md-outlined-select v-model="config.gamemode" label="游戏模式">
                <md-select-option value="survival">生存</md-select-option>
                <md-select-option value="creative">创造</md-select-option>
                <md-select-option value="adventure">冒险</md-select-option>
                <md-select-option value="spectator">旁观</md-select-option>
              </md-outlined-select>
            </div>
            <div class="form-field">
              <md-outlined-select v-model="config.difficulty" label="难度">
                <md-select-option value="peaceful">和平</md-select-option>
                <md-select-option value="easy">简单</md-select-option>
                <md-select-option value="normal">普通</md-select-option>
                <md-select-option value="hard">困难</md-select-option>
              </md-outlined-select>
            </div>
            <div class="form-field">
              <md-outlined-select v-model="config.forceGamemode" label="默认游戏模式">
                <md-select-option value="survival">生存</md-select-option>
                <md-select-option value="creative">创造</md-select-option>
                <md-select-option value="adventure">冒险</md-select-option>
                <md-select-option value="spectator">旁观</md-select-option>
              </md-outlined-select>
            </div>
          </div>
        </section>

        <section id="section-rules" class="config-section">
          <h2 class="section-title">游戏规则</h2>
          <div class="gamerules-grid">
            <div class="form-field switch-field">
              <label class="field-label">PVP</label>
              <md-switch :selected="config.pvp" @change="config.pvp = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">允许飞行</label>
              <md-switch :selected="config.allowFlight" @change="config.allowFlight = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">生成动物</label>
              <md-switch :selected="config.spawnAnimals" @change="config.spawnAnimals = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">生成怪物</label>
              <md-switch :selected="config.spawnMonsters" @change="config.spawnMonsters = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">保留物品栏</label>
              <md-switch :selected="config.keepInventory" @change="config.keepInventory = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">生物破坏</label>
              <md-switch :selected="config.mobGriefing" @change="config.mobGriefing = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">昼夜更替</label>
              <md-switch :selected="config.doDaylightCycle" @change="config.doDaylightCycle = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">天气更替</label>
              <md-switch :selected="config.doWeatherCycle" @change="config.doWeatherCycle = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">火焰蔓延</label>
              <md-switch :selected="config.doFireTick" @change="config.doFireTick = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">TNT 爆炸</label>
              <md-switch :selected="config.tntExplodes" @change="config.tntExplodes = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">自然恢复</label>
              <md-switch :selected="config.naturalRegeneration" @change="config.naturalRegeneration = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">命令方块</label>
              <md-switch :selected="config.commandBlocks" @change="config.commandBlocks = $event.target.selected"></md-switch>
            </div>
          </div>
        </section>

        <section id="section-network" class="config-section">
          <h2 class="section-title">网络与性能</h2>
          <div class="form-grid">
            <div class="form-field">
              <md-outlined-text-field v-model="config.port" label="端口" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.maxPlayers" label="最大玩家数" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.viewDistance" label="视距" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.simulationDistance" label="模拟距离" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.networkCompression" label="网络压缩阈值" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.maxTickTime" label="最大Tick时间" type="number"></md-outlined-text-field>
            </div>
          </div>
        </section>

        <section id="section-generation" class="config-section">
          <h2 class="section-title">生成</h2>
          <div class="gamerules-grid">
            <div class="form-field switch-field">
              <label class="field-label">生成结构</label>
              <md-switch :selected="config.generateStructures" @change="config.generateStructures = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">生成 NPC</label>
              <md-switch :selected="config.spawnNPCs" @change="config.spawnNPCs = $event.target.selected"></md-switch>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.seed" label="世界种子" type="text"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-select v-model="config.levelType" label="世界类型">
                <md-select-option value="minecraft:normal">默认</md-select-option>
                <md-select-option value="minecraft:flat">超平坦</md-select-option>
                <md-select-option value="minecraft:large_biomes">大型生物群系</md-select-option>
                <md-select-option value="minecraft:amplified">巨型</md-select-option>
                <md-select-option value="minecraft:single_biome_surface">单一生物群系</md-select-option>
              </md-outlined-select>
            </div>
          </div>
        </section>

        <section id="section-security" class="config-section">
          <h2 class="section-title">验证与安全</h2>
          <div class="gamerules-grid">
            <div class="form-field switch-field">
              <label class="field-label">正版验证</label>
              <md-switch :selected="config.onlineMode" @change="config.onlineMode = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">强制安全资料</label>
              <md-switch :selected="config.enforceSecureProfile" @change="config.enforceSecureProfile = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">启用白名单</label>
              <md-switch :selected="config.whiteList" @change="config.whiteList = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">强制白名单</label>
              <md-switch :selected="config.enforceWhitelist" @change="config.enforceWhitelist = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">允许下界</label>
              <md-switch :selected="config.allowNether" @change="config.allowNether = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">极限模式</label>
              <md-switch :selected="config.hardcore" @change="config.hardcore = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">隐藏在线玩家</label>
              <md-switch :selected="config.hideOnlinePlayers" @change="config.hideOnlinePlayers = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">启用状态查询</label>
              <md-switch :selected="config.enableQuery" @change="config.enableQuery = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">日志记录IP</label>
              <md-switch :selected="config.logIPs" @change="config.logIPs = $event.target.selected"></md-switch>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">接受转移</label>
              <md-switch :selected="config.acceptsTransfers" @change="config.acceptsTransfers = $event.target.selected"></md-switch>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <md-outlined-select v-model="config.opPermissionLevel" label="OP 权限等级">
                <md-select-option value="1">1 - 规避生成保护</md-select-option>
                <md-select-option value="2">2 - 指令基础权限</md-select-option>
                <md-select-option value="3">3 - 多人游戏管理</md-select-option>
                <md-select-option value="4">4 - 完全管理员</md-select-option>
              </md-outlined-select>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.spawnProtection" label="生成保护半径" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.maxWorldSize" label="最大世界大小" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.playerIdleTimeout" label="玩家闲置超时" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.rateLimit" label="速率限制" type="number"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.functionPermissionLevel" label="函数权限等级" type="number"></md-outlined-text-field>
            </div>
          </div>
        </section>

        <section id="section-resourcepack" class="config-section">
          <h2 class="section-title">资源包</h2>
          <div class="form-grid">
            <div class="form-field full-width">
              <md-outlined-text-field v-model="config.resourcePack" label="资源包 URL" type="text"></md-outlined-text-field>
            </div>
            <div class="form-field full-width">
              <md-outlined-text-field v-model="config.resourcePackPrompt" label="资源包提示信息" type="text"></md-outlined-text-field>
            </div>
            <div class="form-field">
              <md-outlined-text-field v-model="config.resourcePackSha1" label="资源包 SHA1" type="text"></md-outlined-text-field>
            </div>
            <div class="form-field switch-field">
              <label class="field-label">强制资源包</label>
              <md-switch :selected="config.requireResourcePack" @change="config.requireResourcePack = $event.target.selected"></md-switch>
            </div>
          </div>
        </section>

        <section id="section-worlds" class="config-section">
          <h2 class="section-title">多世界</h2>
          <p class="section-desc">使用数据包创建自定义维度，支持原版三世界 + 自定义世界。</p>
          <router-link to="/worlds" style="text-decoration:none">
            <md-outlined-button>
              <md-icon slot="icon">public</md-icon>
              打开多世界管理
            </md-outlined-button>
          </router-link>
        </section>
      </div>

      <div v-else class="raw-mode" key="raw">
        <PropsEditor v-model="rawContent" />
      </div>
    </transition>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SegmentedButton from '@/components/SegmentedButton.vue'
import PropsEditor from '@/components/PropsEditor.vue'

const route = useRoute()

async function getServerPropsPath() {
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.serverPath) return cfg.serverPath + '\\server.properties'
  } catch(e) {}
  return 'D:\\Games\\Minecraft\\MCServer\\server.properties'
}

const serverIcon = ref('')
const iconPreviewStyle = computed(() => {
  if (!serverIcon.value) return {}
  const v = serverIcon.value
  if (v.match(/^[A-Za-z]:\\/)) {
    return { backgroundImage: `url('file:///${v.replace(/\\/g, '/')}')` }
  }
  return { backgroundImage: `url('${v}')` }
})

async function selectIcon() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Server Icon (64x64)', extensions: ['png'] }])
  if (!path) return
  serverIcon.value = path
}

const mode = ref<'form' | 'raw'>('form')
const transName = ref('tab-slide')
const prevMode = ref(mode.value)
watch(mode, (val) => {
  const order = ['form', 'raw']
  const prev = order.indexOf(prevMode.value)
  const curr = order.indexOf(val)
  transName.value = curr > prev ? 'slide-left' : 'slide-right'
  prevMode.value = val
})

const config = reactive({
  motd: 'A Minecraft Server',
  description: '',
  gamemode: 'survival',
  difficulty: 'easy',
  pvp: true,
  allowFlight: false,
  spawnAnimals: true,
  spawnMonsters: true,
  keepInventory: false,
  mobGriefing: true,
  doDaylightCycle: true,
  doWeatherCycle: true,
  doFireTick: true,
  tntExplodes: true,
  naturalRegeneration: true,
  commandBlocks: false,
  forceGamemode: 'survival',
  port: '25565',
  maxPlayers: '20',
  viewDistance: '10',
  simulationDistance: '10',
  networkCompression: '256',
  maxTickTime: '60000',
  generateStructures: true,
  spawnNPCs: true,
  seed: '',
  levelType: 'minecraft:normal',
  onlineMode: true,
  enforceSecureProfile: false,
  whiteList: false,
  enforceWhitelist: false,
  allowNether: true,
  hardcore: false,
  hideOnlinePlayers: false,
  enableQuery: false,
  logIPs: true,
  acceptsTransfers: false,
  opPermissionLevel: '4',
  spawnProtection: '16',
  maxWorldSize: '29999984',
  playerIdleTimeout: '0',
  rateLimit: '0',
  functionPermissionLevel: '2',
  resourcePack: '',
  resourcePackPrompt: '',
  resourcePackSha1: '',
  requireResourcePack: false,
})

const rawContent = ref('')

async function saveConfig() {
  const path = await getServerPropsPath()
  // Read existing props first to preserve all keys
  let existing: Record<string, string> = {}
  try { existing = await window.electronAPI.readServerProperties(path) } catch(e) {}
  // Merge: existing takes priority for keys not in the form
  const merged = {
    ...existing,
    'motd': config.motd,
    'server-port': config.port,
    'max-players': config.maxPlayers,
    'difficulty': config.difficulty,
    'gamemode': config.gamemode,
    'pvp': config.pvp ? 'true' : 'false',
    'allow-flight': config.allowFlight ? 'true' : 'false',
    'spawn-animals': config.spawnAnimals ? 'true' : 'false',
    'spawn-monsters': config.spawnMonsters ? 'true' : 'false',
    'view-distance': config.viewDistance,
    'simulation-distance': config.simulationDistance,
    'generate-structures': config.generateStructures ? 'true' : 'false',
    'enable-command-block': config.commandBlocks ? 'true' : 'false',
    'network-compression-threshold': config.networkCompression,
    'max-tick-time': config.maxTickTime,
    'level-seed': config.seed || '',
    'level-type': config.levelType,
    'online-mode': config.onlineMode ? 'true' : 'false',
    'enforce-secure-profile': config.enforceSecureProfile ? 'true' : 'false',
    'white-list': config.whiteList ? 'true' : 'false',
    'enforce-whitelist': config.enforceWhitelist ? 'true' : 'false',
    'allow-nether': config.allowNether ? 'true' : 'false',
    'hardcore': config.hardcore ? 'true' : 'false',
    'hide-online-players': config.hideOnlinePlayers ? 'true' : 'false',
    'enable-query': config.enableQuery ? 'true' : 'false',
    'log-ips': config.logIPs ? 'true' : 'false',
    'accepts-transfers': config.acceptsTransfers ? 'true' : 'false',
    'op-permission-level': config.opPermissionLevel,
    'spawn-protection': config.spawnProtection,
    'max-world-size': config.maxWorldSize,
    'player-idle-timeout': config.playerIdleTimeout,
    'rate-limit': config.rateLimit,
    'function-permission-level': config.functionPermissionLevel,
    'resource-pack': config.resourcePack,
    'resource-pack-prompt': config.resourcePackPrompt,
    'resource-pack-sha1': config.resourcePackSha1,
    'require-resource-pack': config.requireResourcePack ? 'true' : 'false',
  }
  await window.electronAPI.writeServerProperties(path, merged)
  if (serverIcon.value) {
    await window.electronAPI.copyServerIcon(serverIcon.value, path.replace('server.properties', ''))
  }
}

function resetConfig() {
  Object.assign(config, {
    motd: 'A Minecraft Server',
    description: '',
    gamemode: 'survival',
    difficulty: 'easy',
    pvp: true,
    allowFlight: false,
    spawnAnimals: true,
    spawnMonsters: true,
    keepInventory: false,
    mobGriefing: true,
    doDaylightCycle: true,
    doWeatherCycle: true,
    doFireTick: true,
    tntExplodes: true,
    naturalRegeneration: true,
    commandBlocks: false,
    forceGamemode: 'survival',
    port: '25565',
    maxPlayers: '20',
    viewDistance: '10',
    simulationDistance: '10',
    networkCompression: '256',
    maxTickTime: '60000',
    generateStructures: true,
    spawnNPCs: true,
    seed: '',
    levelType: 'minecraft:normal',
    onlineMode: true,
    enforceSecureProfile: false,
    whiteList: false,
    enforceWhitelist: false,
    allowNether: true,
    hardcore: false,
    hideOnlinePlayers: false,
    enableQuery: false,
    logIPs: true,
    acceptsTransfers: false,
    opPermissionLevel: '4',
    spawnProtection: '16',
    maxWorldSize: '29999984',
    playerIdleTimeout: '0',
    rateLimit: '0',
    functionPermissionLevel: '2',
    resourcePack: '',
    resourcePackPrompt: '',
    resourcePackSha1: '',
    requireResourcePack: false,
  })
}

watch(() => route.query.section, (section) => {
  if (section) {
    setTimeout(() => {
      document.getElementById(section as string)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
}, { immediate: true })

onMounted(() => { loadConfig() })

async function loadConfig() {
  try {
    const path = await getServerPropsPath()
    const props = await window.electronAPI.readServerProperties(path)
    if (props.motd) config.motd = props.motd
    if (props['server-port']) config.port = props['server-port']
    if (props['max-players']) config.maxPlayers = props['max-players']
    if (props.difficulty) config.difficulty = props.difficulty
    if (props.gamemode) config.gamemode = props.gamemode
    if (props.pvp) config.pvp = props.pvp === 'true'
    if (props['allow-flight']) config.allowFlight = props['allow-flight'] === 'true'
    if (props['spawn-animals']) config.spawnAnimals = props['spawn-animals'] === 'true'
    if (props['spawn-monsters']) config.spawnMonsters = props['spawn-monsters'] === 'true'
    if (props['view-distance']) config.viewDistance = props['view-distance']
    if (props['simulation-distance']) config.simulationDistance = props['simulation-distance']
    if (props['generate-structures']) config.generateStructures = props['generate-structures'] === 'true'
    if (props['enable-command-block']) config.commandBlocks = props['enable-command-block'] === 'true'
    if (props['network-compression-threshold']) config.networkCompression = props['network-compression-threshold']
    if (props['max-tick-time']) config.maxTickTime = props['max-tick-time']
    if (props['level-seed']) config.seed = props['level-seed']
    if (props['level-type']) config.levelType = props['level-type']
    if (props['online-mode']) config.onlineMode = props['online-mode'] === 'true'
    if (props['enforce-secure-profile']) config.enforceSecureProfile = props['enforce-secure-profile'] === 'true'
    if (props['white-list']) config.whiteList = props['white-list'] === 'true'
    if (props['enforce-whitelist']) config.enforceWhitelist = props['enforce-whitelist'] === 'true'
    if (props['allow-nether']) config.allowNether = props['allow-nether'] === 'true'
    if (props.hardcore) config.hardcore = props.hardcore === 'true'
    if (props['hide-online-players']) config.hideOnlinePlayers = props['hide-online-players'] === 'true'
    if (props['enable-query']) config.enableQuery = props['enable-query'] === 'true'
    if (props['log-ips']) config.logIPs = props['log-ips'] === 'true'
    if (props['accepts-transfers']) config.acceptsTransfers = props['accepts-transfers'] === 'true'
    if (props['op-permission-level']) config.opPermissionLevel = props['op-permission-level']
    if (props['spawn-protection']) config.spawnProtection = props['spawn-protection']
    if (props['max-world-size']) config.maxWorldSize = props['max-world-size']
    if (props['player-idle-timeout']) config.playerIdleTimeout = props['player-idle-timeout']
    if (props['rate-limit']) config.rateLimit = props['rate-limit']
    if (props['function-permission-level']) config.functionPermissionLevel = props['function-permission-level']
    if (props['resource-pack']) config.resourcePack = props['resource-pack']
    if (props['resource-pack-prompt']) config.resourcePackPrompt = props['resource-pack-prompt']
    if (props['resource-pack-sha1']) config.resourcePackSha1 = props['resource-pack-sha1']
    if (props['require-resource-pack']) config.requireResourcePack = props['require-resource-pack'] === 'true'
    const raw = await window.electronAPI.readFile(path)
    rawContent.value = raw
  } catch(e) {
    console.warn('ServerConfig load failed:', (e as Error).message)
  }
}

</script>

<style scoped>
.config-view {
  max-width: 840px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-title { font-size: 22px; font-weight: 700; }

.config-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--md-sys-color-on-surface);
}

.section-desc {
  font-size: 12px;
  color: var(--md-sys-color-outline);
  margin-bottom: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.gamerules-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 32px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field.full-width { grid-column: 1 / -1; }

.field-label {
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
  font-weight: 500;
}

.switch-field {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.icon-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-preview {
  width: 64px;
  height: 64px;
  background: var(--md-sys-color-surface-container-highest);
  border-radius: var(--md-sys-shape-corner-small);
  border: 2px dashed var(--md-sys-color-outline-variant);
}

.world-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.world-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 13px;
}

.world-item .material-symbols-outlined { font-size: 20px; color: var(--md-sys-color-primary); }

.world-info { display: flex; flex-direction: column; gap: 2px; min-width: 120px; }
.world-name { font-weight: 600; }

.world-id {
  font-size: 11px;
  color: var(--md-sys-color-outline);
  font-family: var(--font-mono);
}

.world-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  background: var(--md-sys-color-surface-dim);
  border-radius: var(--md-sys-shape-corner-extra-small);
  color: var(--md-sys-color-outline);
}

.world-status.active {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-primary);
}

.world-action {
  width: 32px; height: 32px;
  border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.world-action:hover { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }
.world-action .material-symbols-outlined { font-size: 18px; }

.world-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.raw-mode {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.raw-mode .form-actions {
  flex-shrink: 0;
  margin-top: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.raw-editor {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}
</style>