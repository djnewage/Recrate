import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Apple, Monitor, Download, Loader2, Check, AlertCircle } from 'lucide-react'

interface ProxyAsset {
  name: string
  size: number
  downloadUrl: string
}

interface ProxyRelease {
  version: string
  assets: ProxyAsset[]
}

interface DownloadLinks {
  macArm: string | null
  macIntel: string | null
  windows: string | null
  version: string | null
  macArmSize: string | null
  macIntelSize: string | null
  windowsSize: string | null
}

function isAppleSilicon(): boolean {
  const isMac = navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac')
  if (!isMac) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        if (renderer.includes('Apple M') || renderer.includes('Apple GPU')) return true
      }
    }
  } catch { /* noop */ }
  if (navigator.userAgent.includes('ARM')) return true
  return false
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

type DownloadState = 'idle' | 'downloading' | 'complete' | 'error'

const features = [
  { name: 'Stream Your Library', desc: 'Access your entire Serato collection wirelessly. Browse, search, and sort thousands of tracks.' },
  { name: 'Smart Filters', desc: 'Filter by BPM range, musical key, and genre to find the perfect track fast.' },
  { name: 'Full Playback', desc: 'Waveform display with cue points and scrubbing. See BPM and key at a glance.' },
  { name: 'Crate Management', desc: 'Create, browse, and organize crates from your phone. Syncs back to Serato.' },
  { name: 'Bulk Selection', desc: 'Select multiple tracks at once and add them to any crate. Build sets on the go.' },
  { name: 'Instant Connection', desc: 'Connect via WiFi or mobile data. No cloud uploads — streams directly from your desktop.' },
  { name: 'Track Identify', desc: 'Identify any playing track and find it in your library. Add to crates instantly.' },
  { name: 'Recrate Builder', desc: 'Describe your ideal set and let AI curate it. Set BPM range, keys, and generate crates.' },
]

export default function HomePage() {
  const [downloads, setDownloads] = useState<DownloadLinks>({
    macArm: null, macIntel: null, windows: null, version: null,
    macArmSize: null, macIntelSize: null, windowsSize: null,
  })
  const [loading, setLoading] = useState(true)
  const [macDownloadState, setMacDownloadState] = useState<DownloadState>('idle')
  const [winDownloadState, setWinDownloadState] = useState<DownloadState>('idle')
  const [isAppleSiliconMac, setIsAppleSiliconMac] = useState(false)

  useEffect(() => { setIsAppleSiliconMac(isAppleSilicon()) }, [])

  useEffect(() => {
    async function fetchLatestRelease() {
      try {
        const response = await fetch('/api/releases')
        if (!response.ok) throw new Error('Failed to fetch release')
        const release: ProxyRelease = await response.json()
        const macArm = release.assets.find(a => a.name.includes('arm64') && a.name.endsWith('.dmg'))
        const macIntel = release.assets.find(a => a.name.includes('x64') && a.name.endsWith('.dmg'))
        const windows = release.assets.find(a => a.name.endsWith('.exe'))
        setDownloads({
          macArm: macArm?.downloadUrl || null,
          macIntel: macIntel?.downloadUrl || null,
          windows: windows?.downloadUrl || null,
          version: release.version,
          macArmSize: macArm ? formatBytes(macArm.size) : null,
          macIntelSize: macIntel ? formatBytes(macIntel.size) : null,
          windowsSize: windows ? formatBytes(windows.size) : null,
        })
      } catch {
        setDownloads({ macArm: null, macIntel: null, windows: null, version: null, macArmSize: null, macIntelSize: null, windowsSize: null })
      } finally {
        setLoading(false)
      }
    }
    fetchLatestRelease()
  }, [])

  const handleDownload = useCallback((url: string | null, platform: 'mac' | 'windows') => {
    if (!url) return
    const setDlState = platform === 'mac' ? setMacDownloadState : setWinDownloadState
    setDlState('downloading')
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => {
      setDlState('complete')
      setTimeout(() => setDlState('idle'), 3000)
    }, 1000)
  }, [])

  const scrollToDownload = () => {
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="bg-[#0a0a0a] min-h-screen overflow-x-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

      {/* ======================== HERO ======================== */}
      <section className="relative min-h-screen flex items-center px-6 pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none">
          <div className="w-[800px] h-[800px] rounded-full bg-purple-500/[0.04] blur-[150px] translate-x-[200px]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <motion.div
              className="flex items-center gap-2.5 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg" />
              <span className="text-sm font-medium text-gray-400">Recrate</span>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight leading-[1.1]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Your Serato Library, <span className="gradient-text">Anywhere</span>
            </motion.h1>

            <motion.p
              className="text-lg text-gray-400 max-w-md mb-8 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Stream your entire DJ library to your phone. Browse tracks, manage crates,
              and preview music — all from your mobile device.
            </motion.p>

            <motion.div
              className="flex flex-col gap-3 items-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <button
                onClick={scrollToDownload}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 transition-all duration-300 btn-glow"
              >
                <Download className="w-5 h-5" />
                Download Now
              </button>
              <span className="text-sm text-gray-600">
                Free 7-day trial &middot; Mac, Windows, iOS &amp; Android
              </span>
            </motion.div>
          </div>

          {/* Hero screenshot */}
          <motion.div
            className="rounded-lg overflow-hidden border border-white/[0.08]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <img
              src="/screenshots/player.png"
              alt="Recrate mobile player with waveform display"
              className="w-full h-auto"
            />
          </motion.div>
        </div>
      </section>

      {/* ======================== DEMO VIDEO ======================== */}
      <section className="relative px-6 pb-16" id="demo">
        <div className="max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-lg overflow-hidden border border-white/[0.08]">
              <video
                src="/demo-video.mp4"
                controls
                loop
                playsInline
                className="w-full h-auto"
              />
            </div>
            <p className="text-gray-600 text-xs font-mono mt-3">Recrate demo</p>
          </motion.div>
        </div>
      </section>

      {/* ======================== SPECS STRIP ======================== */}
      <section className="px-6 py-10 border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-500 text-xs font-mono tracking-wide text-center md:text-left">
            Serato integration &middot; WiFi &amp; mobile streaming &middot; Offline mode &middot; MP3, WAV, FLAC, AAC &middot; Mac, Windows, iOS, Android
          </p>
        </div>
      </section>

      {/* ======================== FEATURES ======================== */}
      <section className="relative px-6 py-24" id="features">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
            {features.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <h3 className="text-white font-medium mb-1">{f.name}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================== PRICING ======================== */}
      <section className="relative px-6 py-24" id="pricing">
        <div className="max-w-4xl mx-auto">
          <motion.blockquote
            className="border-l-2 border-purple-500/30 pl-6 mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xl md:text-2xl text-gray-500 italic leading-relaxed">
              7-day free trial. Subscribe when you're ready.
            </p>
          </motion.blockquote>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-sm text-gray-500 mb-2">Free Trial</p>
              <p className="text-4xl font-bold text-white mb-6">$0</p>
              <ul className="space-y-3 mb-8">
                {['7-day full access', 'All features included', 'No credit card required'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={scrollToDownload}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] transition-all duration-300"
              >
                Get Started
              </button>
            </motion.div>

            <motion.div
              className="md:pl-12 md:border-l-2 md:border-purple-500/20"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <p className="text-sm text-purple-400 mb-2">Pro</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$4.99</span>
                <span className="text-gray-500 text-sm ml-1">/ month</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['Unlimited access', 'All features included', 'Priority support'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={scrollToDownload}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 transition-all duration-300 btn-glow"
              >
                Download &amp; Subscribe
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ======================== DOWNLOAD ======================== */}
      <section className="relative px-6 py-24 border-t border-white/[0.05]" id="download">
        <div className="relative max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-gray-500 text-sm mb-8">Requires the Recrate mobile app to connect. Available on iOS and Android.</p>

            <AnimatePresence mode="wait">
              {loading && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                  <p className="text-gray-500 text-sm">Checking for latest release...</p>
                </motion.div>
              )}

              {!loading && (downloads.macArm || downloads.macIntel || downloads.windows) && (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
                  {/* macOS Downloads */}
                  <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                    {(() => {
                      const primaryMac = isAppleSiliconMac ? downloads.macArm : downloads.macIntel
                      const primarySize = isAppleSiliconMac ? downloads.macArmSize : downloads.macIntelSize
                      const primaryLabel = isAppleSiliconMac ? 'Apple Silicon' : 'Intel Mac'
                      const secondaryMac = isAppleSiliconMac ? downloads.macIntel : downloads.macArm
                      const secondarySize = isAppleSiliconMac ? downloads.macIntelSize : downloads.macArmSize
                      const secondaryLabel = isAppleSiliconMac ? 'Intel Mac' : 'Apple Silicon'

                      return (
                        <>
                          {primaryMac && (
                            <button
                              onClick={() => handleDownload(primaryMac, 'mac')}
                              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 transition-all duration-300 btn-glow text-sm"
                            >
                              <AnimatePresence mode="wait">
                                {macDownloadState === 'downloading' ? (
                                  <motion.div key="dl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  </motion.div>
                                ) : macDownloadState === 'complete' ? (
                                  <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <Check className="w-4 h-4" />
                                  </motion.div>
                                ) : (
                                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <Apple className="w-4 h-4" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              macOS — {primaryLabel}
                              {primarySize && <span className="text-white/60 font-normal">{primarySize}</span>}
                            </button>
                          )}
                          {secondaryMac && (
                            <button
                              onClick={() => handleDownload(secondaryMac, 'mac')}
                              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-white/[0.05] border border-white/[0.1] hover:border-purple-500/50 hover:bg-white/[0.08] transition-all duration-300 text-sm"
                            >
                              <Apple className="w-4 h-4 shrink-0" />
                              macOS — {secondaryLabel}
                              {secondarySize && <span className="text-white/40 font-normal">{secondarySize}</span>}
                            </button>
                          )}
                        </>
                      )
                    })()}

                    {/* Windows */}
                    {downloads.windows && (
                      <button
                        onClick={() => handleDownload(downloads.windows, 'windows')}
                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-white/[0.05] border border-white/[0.1] hover:border-purple-500/50 hover:bg-white/[0.08] transition-all duration-300 text-sm"
                      >
                        <AnimatePresence mode="wait">
                          {winDownloadState === 'downloading' ? (
                            <motion.div key="dl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </motion.div>
                          ) : winDownloadState === 'complete' ? (
                            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Check className="w-4 h-4" />
                            </motion.div>
                          ) : (
                            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Monitor className="w-4 h-4 shrink-0" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        Windows
                        {downloads.windowsSize && <span className="text-white/40 font-normal">{downloads.windowsSize}</span>}
                      </button>
                    )}
                  </div>

                  {downloads.version && (
                    <p className="text-gray-600 text-xs font-mono">{downloads.version}</p>
                  )}

                  <p className="text-gray-600 text-xs max-w-sm leading-relaxed">
                    Not sure which Mac version? Click <span className="text-gray-400"></span> &rarr; <span className="text-gray-400">About This Mac</span>.<br />
                    See &ldquo;Apple M1&rdquo; or later? Choose Apple Silicon.
                  </p>
                </motion.div>
              )}

              {!loading && !downloads.macArm && !downloads.macIntel && !downloads.windows && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-gray-500 bg-white/[0.05] border border-white/[0.07] cursor-default">Coming Soon</div>
                  <p className="text-gray-600 text-xs">The first release is on the way.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Download started toast */}
            <AnimatePresence>
              {(macDownloadState === 'complete' || winDownloadState === 'complete') && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-full text-green-400 text-sm"
                >
                  <Check size={16} />
                  Download started! Check your downloads folder.
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-12 text-center">
        <p className="text-gray-600 text-xs font-mono tracking-wide">Built by Recrate LLC</p>
      </section>
    </div>
  )
}
