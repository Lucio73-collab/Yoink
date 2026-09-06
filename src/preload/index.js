import { contextBridge, ipcRenderer, webUtils } from 'electron'

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

const on = (channel, handler) => {
  const wrapped = (_e, payload) => handler(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('yoink', {
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    reset: () => invoke('settings:reset')
  },
  bin: {
    status: () => invoke('bin:status'),
    ensure: (opts) => invoke('bin:ensure', opts),
    capabilities: () => invoke('bin:capabilities'),
    onProgress: (fn) => on('bin:progress', fn),
    onRefreshed: (fn) => on('bin:refreshed', fn)
  },
  probe: (url) => invoke('probe', url),
  queue: {
    list: () => invoke('queue:list'),
    add: (entries) => invoke('queue:add', entries),
    cancel: (id) => invoke('queue:cancel', id),
    retry: (id) => invoke('queue:retry', id),
    remove: (id) => invoke('queue:remove', id),
    clearFinished: () => invoke('queue:clearFinished'),
    stats: () => invoke('queue:stats'),
    onUpdate: (fn) => on('queue:update', fn)
  },
  spotify: {
    status: () => invoke('spotify:status'),
    connect: () => invoke('spotify:connect'),
    disconnect: () => invoke('spotify:disconnect'),
    cancelAuth: () => invoke('spotify:cancelAuth'),
    parse: (url) => invoke('spotify:parse', url),
    resolve: (url) => invoke('spotify:resolve', url),
    match: (tracks) => invoke('spotify:match', tracks),
    onMatchProgress: (fn) => on('spotify:matchProgress', fn)
  },
  media: {
    probe: (files) => invoke('media:probe', files),
    presets: () => invoke('media:presets'),
    plan: (file, targetBytes) => invoke('media:plan', file, targetBytes)
  },
  // File.path was removed in Electron 32. webUtils.getPathForFile is the
  // supported way to turn a dropped File into a real filesystem path.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  },
  pickMedia: () => invoke('pick:media'),
  pickFolder: (current) => invoke('pick:folder', current),
  pickFile: (filters) => invoke('pick:file', filters),
  reveal: (target) => invoke('open:path', target),
  openFolder: (dir) => invoke('open:folder', dir),
  openExternal: (url) => invoke('open:external', url),
  appInfo: () => invoke('app:info'),
  update: {
    check: () => invoke('update:check'),
    install: () => invoke('update:install'),
    onStatus: (fn) => on('update:status', fn)
  },
  onClipboardUrl: (fn) => on('clipboard:url', fn),
  onToast: (fn) => on('queue:toast', fn)
})
