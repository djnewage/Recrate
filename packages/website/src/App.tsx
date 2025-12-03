import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Apple, Monitor, Mail, Github, Music, Smartphone, Zap, Loader2, Check, AlertCircle, Play } from 'lucide-react'

const GITHUB_REPO = 'djnewage/Recrate'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  assets: ReleaseAsset[]
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

/**
 * Detect if user is on Apple Silicon Mac
 * Uses WebGL renderer info as a reliable detection method
 */
function isAppleSilicon(): boolean {
  // Check if we're on macOS first
  const isMac = navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac')

  if (!isMac) return false

  // Try WebGL detection for Apple Silicon
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        // Apple Silicon GPUs contain "Apple" in the renderer string
        // Intel Macs have "Intel" in the renderer string
        if (renderer.includes('Apple M') || renderer.includes('Apple GPU')) {
          return true
        }
      }
    }
  } catch {
    // WebGL not available, fall back to other detection
  }

  // Fallback: Check userAgent for ARM architecture hints
  // Modern Safari on Apple Silicon may include this
  if (navigator.userAgent.includes('ARM')) {
    return true
  }

  // Default to Intel for older/unknown Macs (safer choice, Rosetta handles arm64)
  return false
}

type DownloadState = 'idle' | 'downloading' | 'complete' | 'error'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function App() {
  const [downloads, setDownloads] = useState<DownloadLinks>({
    macArm: null,
    macIntel: null,
    windows: null,
    version: null,
    macArmSize: null,
    macIntelSize: null,
    windowsSize: null,
  })
  const [loading, setLoading] = useState(true)
  const [macDownloadState, setMacDownloadState] = useState<DownloadState>('idle')
  const [winDownloadState, setWinDownloadState] = useState<DownloadState>('idle')
  const [isAppleSiliconMac, setIsAppleSiliconMac] = useState(false)

  // Detect chip type on mount
  useEffect(() => {
    setIsAppleSiliconMac(isAppleSilicon())
  }, [])

  useEffect(() => {
    async function fetchLatestRelease() {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
        )
        if (!response.ok) throw new Error('Failed to fetch release')

        const release: Release = await response.json()

        const macArm = release.assets.find(
          (a) => a.name.includes('arm64') && a.name.endsWith('.dmg')
        )
        const macIntel = release.assets.find(
          (a) => a.name.includes('x64') && a.name.endsWith('.dmg')
        )
        const windows = release.assets.find(
          (a) => a.name.endsWith('.exe')
        )

        setDownloads({
          macArm: macArm?.browser_download_url || null,
          macIntel: macIntel?.browser_download_url || null,
          windows: windows?.browser_download_url || null,
          version: release.tag_name,
          macArmSize: macArm ? formatBytes(macArm.size) : null,
          macIntelSize: macIntel ? formatBytes(macIntel.size) : null,
          windowsSize: windows ? formatBytes(windows.size) : null,
        })
      } catch {
        // No releases available yet - this is expected for new/private repos
        setDownloads({
          macArm: null,
          macIntel: null,
          windows: null,
          version: null,
          macArmSize: null,
          macIntelSize: null,
          windowsSize: null,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchLatestRelease()
  }, [])

  const handleDownload = useCallback((url: string | null, platform: 'mac' | 'windows') => {
    if (!url) return

    const setDownloadState = platform === 'mac' ? setMacDownloadState : setWinDownloadState

    setDownloadState('downloading')

    // Create a hidden link and trigger download
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Show success state briefly
    setTimeout(() => {
      setDownloadState('complete')
      setTimeout(() => setDownloadState('idle'), 3000)
    }, 1000)
  }, [])

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Recrate" className="w-10 h-10 rounded-xl" />
            <span className="text-xl font-bold gradient-text">Recrate</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#demo" className="text-gray-300 hover:text-white transition-colors">Demo</a>
            <a href="#download" className="text-gray-300 hover:text-white transition-colors">Download</a>
            <a href="#contact" className="text-gray-300 hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </nav>

      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background - Replace src with your video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="video-bg"
          poster="/video-poster.jpg"
        >
          {/* Add your video source here */}
          {/* <source src="/hero-video.mp4" type="video/mp4" /> */}
        </video>

        {/* Fallback gradient background if no video */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-black to-pink-900/40 -z-2" />

        <div className="video-overlay" />

        {/* Animated gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/30 rounded-full blur-3xl animate-pulse delay-1000" />

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <img
              src="/logo.png"
              alt="Recrate Logo"
              className="w-32 h-32 mx-auto mb-8 rounded-3xl glow"
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl md:text-7xl font-extrabold mb-6"
          >
            Your Serato Library,{' '}
            <span className="gradient-text">Anywhere</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-gray-300 mb-10 max-w-3xl mx-auto"
          >
            Stream your entire DJ library to your phone. Browse tracks, manage crates,
            and preview music — all from your mobile device.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition-all btn-glow"
            >
              <Download size={20} />
              Download Now
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 border border-white/20 rounded-full font-semibold text-lg hover:bg-white/20 transition-all"
            >
              Learn More
            </a>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-3 bg-white/50 rounded-full mt-2"
            />
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-gradient-to-b from-black to-zinc-900">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Powerful features designed for DJs who want freedom from their laptop
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Music,
                title: 'Stream Your Library',
                description: 'Access your entire Serato music collection wirelessly. Browse, search, and preview tracks in real-time.',
              },
              {
                icon: Smartphone,
                title: 'Mobile Crate Management',
                description: 'Create, edit, and organize crates from your phone. Changes sync instantly back to Serato.',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                description: 'Local network streaming means zero latency. Preview tracks instantly without waiting for downloads.',
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 hover:border-purple-500/50 transition-colors group"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon size={28} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-24 px-6 bg-zinc-900">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              See It In <span className="gradient-text">Action</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Watch how Recrate connects your desktop library to your mobile device
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            {/* Video Container */}
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/50">
              {/* Placeholder - Replace YOUTUBE_VIDEO_ID with actual video ID */}
              {/* Example: dQw4w9WgXcQ */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/20 to-pink-900/20">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Play size={32} className="text-white ml-1" />
                  </div>
                  <p className="text-gray-400">Demo video coming soon</p>
                  <p className="text-gray-500 text-sm mt-2">Record your demo and replace this placeholder</p>
                </div>
              </div>

              {/* Uncomment and add your YouTube video ID when ready */}
              {/*
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube-nocookie.com/embed/YOUTUBE_VIDEO_ID?rel=0&modestbranding=1"
                title="Recrate Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              */}
            </div>

            {/* Decorative glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl -z-10" />
          </motion.div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-24 px-6 bg-gradient-to-b from-zinc-900 to-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Download <span className="gradient-text">Recrate</span>
            </h2>
            <p className="text-xl text-gray-400 mb-12">
              Available for macOS and Windows. Free to use.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* macOS Download - Auto-detects Apple Silicon vs Intel */}
            {(() => {
              const macDownloadUrl = isAppleSiliconMac ? downloads.macArm : downloads.macIntel
              const macSize = isAppleSiliconMac ? downloads.macArmSize : downloads.macIntelSize
              const chipLabel = isAppleSiliconMac ? 'Apple Silicon' : 'Intel'
              const hasMacDownload = macDownloadUrl !== null

              return (
                <motion.button
                  onClick={() => handleDownload(macDownloadUrl, 'mac')}
                  disabled={loading || !hasMacDownload}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border transition-all group text-left ${
                    loading || !hasMacDownload
                      ? 'border-white/5 opacity-60 cursor-not-allowed'
                      : 'border-white/10 hover:border-purple-500/50 hover:scale-105 cursor-pointer'
                  }`}
                >
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0">
                    <Apple size={32} className="text-white" />
                  </div>
                  <div className="text-left flex-grow">
                    <div className="text-sm text-gray-400 mb-1">Download for</div>
                    <div className="text-2xl font-bold">macOS</div>
                    <div className="text-sm text-gray-500">
                      {loading ? 'Checking...' : hasMacDownload ? `${chipLabel}${macSize ? ` • ${macSize}` : ''}` : 'Coming Soon'}
                    </div>
                    {/* Show link to other version */}
                    {!loading && hasMacDownload && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(isAppleSiliconMac ? downloads.macIntel : downloads.macArm, 'mac')
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 mt-1 underline"
                      >
                        Need {isAppleSiliconMac ? 'Intel' : 'Apple Silicon'} version?
                      </button>
                    )}
                  </div>
                  <div className="ml-auto flex-shrink-0">
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <Loader2 size={20} className="text-gray-400 animate-spin" />
                        </motion.div>
                      ) : macDownloadState === 'downloading' ? (
                        <motion.div key="downloading" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                          <Loader2 size={20} className="text-purple-400 animate-spin" />
                        </motion.div>
                      ) : macDownloadState === 'complete' ? (
                        <motion.div key="complete" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                          <Check size={20} className="text-green-400" />
                        </motion.div>
                      ) : !hasMacDownload ? (
                        <motion.div key="unavailable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <AlertCircle size={20} className="text-gray-500" />
                        </motion.div>
                      ) : (
                        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <Download size={20} className="text-gray-400 group-hover:text-purple-400 transition-colors" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>
              )
            })()}

            {/* Windows Download */}
            <motion.button
              onClick={() => handleDownload(downloads.windows, 'windows')}
              disabled={loading || !downloads.windows}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border transition-all group text-left ${
                loading || !downloads.windows
                  ? 'border-white/5 opacity-60 cursor-not-allowed'
                  : 'border-white/10 hover:border-purple-500/50 hover:scale-105 cursor-pointer'
              }`}
            >
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                <Monitor size={32} className="text-white" />
              </div>
              <div className="text-left flex-grow">
                <div className="text-sm text-gray-400 mb-1">Download for</div>
                <div className="text-2xl font-bold">Windows</div>
                <div className="text-sm text-gray-500">
                  {loading ? 'Checking...' : downloads.windows ? `Windows 10/11${downloads.windowsSize ? ` • ${downloads.windowsSize}` : ''}` : 'Coming Soon'}
                </div>
              </div>
              <div className="ml-auto flex-shrink-0">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 size={20} className="text-gray-400 animate-spin" />
                    </motion.div>
                  ) : winDownloadState === 'downloading' ? (
                    <motion.div key="downloading" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                      <Loader2 size={20} className="text-purple-400 animate-spin" />
                    </motion.div>
                  ) : winDownloadState === 'complete' ? (
                    <motion.div key="complete" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                      <Check size={20} className="text-green-400" />
                    </motion.div>
                  ) : !downloads.windows ? (
                    <motion.div key="unavailable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <AlertCircle size={20} className="text-gray-500" />
                    </motion.div>
                  ) : (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Download size={20} className="text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          </div>

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

          {/* Version info */}
          {downloads.version && (
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-6 text-sm text-gray-500"
            >
              Version {downloads.version}
            </motion.p>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 text-gray-500 text-sm"
          >
            Requires the Recrate mobile app to connect.{' '}
            <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors">
              Available on iOS and Android
            </a>
          </motion.p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 px-6 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Get in Touch
            </h2>
            <p className="text-xl text-gray-400 mb-12">
              Questions, feedback, or just want to say hi? We'd love to hear from you.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a
              href="mailto:tristan@recrate.app"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition-all btn-glow"
            >
              <Mail size={20} />
              Email Us
            </a>
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 border border-white/20 rounded-full font-semibold text-lg hover:bg-white/20 transition-all"
            >
              <Github size={20} />
              GitHub
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Recrate" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold">Recrate</span>
          </div>
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Recrate. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
