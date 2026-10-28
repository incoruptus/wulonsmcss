import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/global.css'
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/button/text-button.js'
import '@material/web/icon/icon.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/switch/switch.js'
import '@material/web/dialog/dialog.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/tabs/tabs.js'
import '@material/web/tabs/primary-tab.js'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')