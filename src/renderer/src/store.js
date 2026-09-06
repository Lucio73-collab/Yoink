import { create } from 'zustand'

const api = window.yoink

export const useStore = create((set, get) => ({
  ready: false,
  filter: 'all', // all | active | done | failed
  settings: null,
  bins: [],
  caps: null,
  jobs: [],
  toasts: [],
  setup: { active: false, items: {} },
  spotify: { connected: false, busy: false, progress: null },

  async init() {
    const [settings, bins, caps, jobs, sp] = await Promise.all([
      api.settings.get(),
      api.bin.status(),
      api.bin.capabilities(),
      api.queue.list(),
      api.spotify.status()
    ])
    set({
      settings: settings.data,
      bins: bins.data,
      caps: caps.data,
      jobs: jobs.data,
      spotify: { ...get().spotify, connected: sp.data?.connected ?? false },
      ready: true
    })

    api.queue.onUpdate((job) => {
      set((s) => {
        if (job.removed) return { jobs: s.jobs.filter((j) => j.id !== job.id) }
        const idx = s.jobs.findIndex((j) => j.id === job.id)
        if (idx === -1) return { jobs: [job, ...s.jobs] }
        const next = [...s.jobs]
        next[idx] = job
        return { jobs: next }
      })
    })

    api.bin.onProgress((e) => {
      set((s) => ({ setup: { ...s.setup, items: { ...s.setup.items, [e.key]: e } } }))
    })

    api.spotify.onMatchProgress((p) => {
      set((s) => ({ spotify: { ...s.spotify, progress: p } }))
    })

    api.update.onStatus((s) => {
      if (s.state === 'ready') {
        get().toast(`Update ${s.version} ready`, 'ok', 'Installs when you close Yoink')
      } else if (s.state === 'available') {
        get().toast(`Downloading update ${s.version}`, 'info')
      }
    })

    api.onToast(({ message, tone }) => get().toast(message, tone))

    api.bin.onRefreshed(async () => {
      const [bins, caps] = await Promise.all([api.bin.status(), api.bin.capabilities()])
      set({ bins: bins.data, caps: caps.data })
    })

    api.onClipboardUrl((url) => {
      get().toast(`Copied link detected`, 'info', url)
    })

    // Fetch the toolchain the first time the app runs.
    if (bins.data.some((b) => !b.installed)) get().runSetup(false)
  },

  setFilter: (filter) => set({ filter }),

  async runSetup(force) {
    set({ setup: { active: true, items: {} } })
    const res = await api.bin.ensure({ force })
    const bins = await api.bin.status()
    const caps = await api.bin.capabilities()
    set({ setup: { active: false, items: {} }, bins: bins.data, caps: caps.data })

    const failed = (res.data || []).filter((r) => r.action === 'failed')
    if (failed.length) {
      get().toast(`Could not fetch ${failed.map((f) => f.key).join(', ')}`, 'error', failed[0].error)
    } else if (force) {
      get().toast('Tools updated', 'ok')
    }
  },

  async saveSettings(patch) {
    const res = await api.settings.set(patch)
    if (res.ok) set({ settings: res.data })
    return res
  },

  async resetSettings() {
    const res = await api.settings.reset()
    if (res.ok) {
      set({ settings: res.data })
      get().toast('Settings restored to defaults', 'ok')
    }
  },

  toast(message, tone = 'info', detail = null) {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, detail }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, tone === 'error' ? 8000 : 3600)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSpotify: (patch) => set((s) => ({ spotify: { ...s.spotify, ...patch } }))
}))
