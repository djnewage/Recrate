import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Apple, Monitor, Music, Loader2, Check, AlertCircle, Play, SlidersHorizontal, FolderOpen, ListChecks, Wifi, AudioWaveform, Send, Sparkles, Brain, Smartphone, Download, ChevronDown, HelpCircle, ScanLine } from 'lucide-react'
import { trackEvent } from '../utils/metaPixel'

const APP_STORE_URL = 'https://apps.apple.com/us/app/recrate/id6756329199'

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

export default function HomePage() {
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

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' })
  const [contactStatus, setContactStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  // Detect chip type on mount
  useEffect(() => {
    setIsAppleSiliconMac(isAppleSilicon())
  }, [])

  // Meta Pixel: track product page view
  useEffect(() => {
    trackEvent('ViewContent', { content_name: 'Recrate', content_category: 'product' })
  }, [])

  useEffect(() => {
    async function fetchLatestRelease() {
      try {
        const response = await fetch('/api/releases')
        if (!response.ok) throw new Error('Failed to fetch release')

        const release: ProxyRelease = await response.json()

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
          macArm: macArm?.downloadUrl || null,
          macIntel: macIntel?.downloadUrl || null,
          windows: windows?.downloadUrl || null,
          version: release.version,
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
    trackEvent('Lead', { content_name: 'Recrate', content_category: 'desktop_download', platform })
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

  const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setContactStatus('sending')

    try {
      const response = await fetch('https://formspree.io/f/mbdlnzqq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      })

      if (response.ok) {
        setContactStatus('success')
        setContactForm({ name: '', email: '', message: '' })
        setTimeout(() => setContactStatus('idle'), 5000)
      } else {
        setContactStatus('error')
        setTimeout(() => setContactStatus('idle'), 5000)
      }
    } catch {
      setContactStatus('error')
      setTimeout(() => setContactStatus('idle'), 5000)
    }
  }, [contactForm])

  return (
    <>
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

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto pt-20">
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
            className="flex flex-col items-center gap-6"
          >
            {/* Mobile App Download CTA */}
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('Lead', { content_name: 'Recrate', content_category: 'app_store_click' })}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition-all btn-glow"
            >
              <Apple size={20} />
              Download on the App Store
            </a>

            {/* Pricing highlight */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="mt-6 mb-16 text-center text-sm text-gray-400"
            >
              <p className="flex items-center justify-center gap-2">
                <Check size={16} className="text-green-400" />
                Free 7-day trial
              </p>
              <p className="mt-1">
                Available on Mac, Windows & iOS — Android coming soon
              </p>
            </motion.div>
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

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Music,
                title: 'Stream Your Library',
                description: 'Access your entire Serato collection wirelessly. Browse, search, and sort thousands of tracks by title, artist, BPM, or key.',
                screenshot: '/screenshots/library.png',
              },
              {
                icon: SlidersHorizontal,
                title: 'Smart Filters',
                description: 'Find the perfect track fast. Filter by BPM range, musical key (major/minor), and genre to match your mix.',
                screenshot: '/screenshots/filters.png',
              },
              {
                icon: Play,
                title: 'Full Playback',
                description: 'Preview any track with waveform display and cue points. Set and jump to cue points, scrub through tracks, and see BPM and key at a glance.',
                screenshot: '/screenshots/player.png',
              },
              {
                icon: FolderOpen,
                title: 'Crate Management',
                description: 'Create, browse, and organize crates from your phone. Changes sync instantly back to Serato DJ Pro.',
                screenshot: '/screenshots/crates.png',
              },
              {
                icon: ListChecks,
                title: 'Bulk Selection',
                description: 'Select multiple tracks at once and add them to any crate. Perfect for building sets on the go.',
                screenshot: '/screenshots/bulk-select.png',
              },
              {
                icon: Wifi,
                title: 'Instant Connection',
                description: 'Connect locally over WiFi or remotely via mobile data/5G. No cloud uploads — your music streams directly from your desktop.',
                screenshot: '/screenshots/connect.png',
              },
              {
                icon: AudioWaveform,
                title: 'Track Identify',
                description: 'Identify any playing track and find it in your library. See matching variations and add to crates instantly.',
                screenshot: '/screenshots/track-identify.png',
              },
              {
                icon: Sparkles,
                title: 'Recrate Builder',
                description: 'Describe your ideal set and let AI curate it. Set BPM range, select keys, and generate perfectly curated crates in seconds.',
                screenshot: '/screenshots/recrate-builder.png',
              },
              {
                icon: Brain,
                title: 'AI Curation',
                description: 'See AI reasoning for every track selection. Understand BPM flow, key compatibility, and how tracks fulfill your request.',
                screenshot: '/screenshots/recrate-builder-preview.png',
              },
            ].map((feature, index, arr) => {
              // Center the last item if it's alone in its row (7th item in 3-col grid)
              const isLastAndAlone = index === arr.length - 1 && arr.length % 3 === 1
              return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: (index % 3) * 0.15 }}
                className={`p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 hover:border-purple-500/50 transition-all hover:scale-[1.02] group ${isLastAndAlone ? 'md:col-start-2' : ''}`}
              >
                {/* Screenshot */}
                <div className="mb-5 rounded-2xl overflow-hidden border border-white/10 bg-black/50 mx-auto max-w-[200px]">
                  <img
                    src={feature.screenshot}
                    alt={`${feature.title} screenshot`}
                    className="w-full h-auto"
                  />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon size={20} className="text-white" />
                  </div>
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                </div>
                <p className="text-gray-400 leading-relaxed text-sm">{feature.description}</p>
              </motion.div>
            )})}

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
            className="relative flex justify-center"
          >
            {/* Video Container - Portrait phone video */}
            <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black/50 max-w-[320px] shadow-2xl">
              <video
                className="w-full h-auto"
                controls
                playsInline
                preload="metadata"
                poster="/screenshots/library.png"
              >
                <source src="/demo-video.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Decorative glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-3xl -z-10 max-w-[400px] mx-auto" />
          </motion.div>
        </div>
      </section>

      {/* How to Use Section */}
      <section id="how-to-use" className="py-24 px-6 bg-gradient-to-b from-zinc-900 to-zinc-900">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How to <span className="gradient-text">Use</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Get started in four simple steps
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Download,
                step: 1,
                title: 'Download the Desktop App',
                description: 'Get Recrate for macOS or Windows from the download section below',
              },
              {
                icon: Monitor,
                step: 2,
                title: 'Set Up the Desktop Server',
                description: 'Follow the on-screen prompts to connect your Serato library',
              },
              {
                icon: Smartphone,
                step: 3,
                title: 'Get the Mobile App',
                description: 'Download Recrate from the App Store or Google Play',
              },
              {
                icon: ScanLine,
                step: 4,
                title: 'Scan & Connect',
                description: 'Open the app and scan the QR code on your desktop to connect',
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 hover:border-purple-500/50 transition-all group text-center"
              >
                {/* Step number */}
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold shadow-lg">
                  {item.step}
                </div>
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <item.icon size={32} className="text-purple-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Link to the full step-by-step guide */}
          <div className="text-center mt-12">
            <Link
              to="/guide"
              className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 font-semibold transition-colors"
            >
              See the full step-by-step guide &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 bg-zinc-900">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-6">
              <HelpCircle size={32} className="text-purple-400" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Frequently Asked <span className="gradient-text">Questions</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to know about Recrate
            </p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                question: 'Is my music uploaded to the cloud?',
                answer: 'No. Your music stays on your computer. Recrate streams directly from your desktop to your phone — nothing is uploaded anywhere.',
              },
              {
                question: 'Do I need to be on the same WiFi network?',
                answer: "Not necessarily! You can connect locally via WiFi, or use mobile data/5G to access your library from anywhere (requires the desktop server to be online).",
              },
              {
                question: 'What devices are supported?',
                answer: 'Desktop: macOS 12+ and Windows 10/11. Mobile: iOS (Android coming soon).',
              },
              {
                question: 'Is Recrate free?',
                answer: 'Recrate offers a free 7-day trial with full access to all features, including 15 AI crate builds. After the trial, it’s a single $9.99/month plan that keeps everything unlocked.',
              },
              {
                question: 'Does it work with Serato DJ Pro?',
                answer: "Yes! Recrate reads your Serato library and crates. Changes you make (like creating crates) sync back to Serato. Note: If Serato is open while you make changes in Recrate, you'll need to restart Serato for the changes to take effect.",
              },
              {
                question: 'Does the desktop server need to be running?',
                answer: "For streaming music, yes — the desktop app must be online. However, Recrate also has an offline mode where you can browse your cached library and make changes (like organizing crates). Streaming won't be available until you reconnect, but any changes you make while offline will automatically sync once the server comes back online.",
              },
              {
                question: 'What audio formats are supported?',
                answer: 'MP3, WAV, FLAC, AAC, and other common formats that Serato supports.',
              },
            ].map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-semibold text-lg pr-4">{faq.question}</span>
                  <motion.div
                    animate={{ rotate: openFaqIndex === index ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown size={20} className="text-purple-400" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaqIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 text-gray-400 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
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
              Available for macOS and Windows. Free 7-day trial included.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* macOS Download */}
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
            {(() => {
              const hasWindowsDownload = downloads.windows !== null

              return (
                <motion.button
                  onClick={() => handleDownload(downloads.windows, 'windows')}
                  disabled={loading || !hasWindowsDownload}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border transition-all group text-left ${
                    loading || !hasWindowsDownload
                      ? 'border-white/5 opacity-60 cursor-not-allowed'
                      : 'border-white/10 hover:border-purple-500/50 hover:scale-105 cursor-pointer'
                  }`}
                >
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center flex-shrink-0">
                    <Monitor size={32} className="text-white" />
                  </div>
                  <div className="text-left flex-grow">
                    <div className="text-sm text-gray-400 mb-1">Download for</div>
                    <div className="text-2xl font-bold">Windows</div>
                    <div className="text-sm text-gray-500">
                      {loading ? 'Checking...' : hasWindowsDownload ? `Windows 10/11${downloads.windowsSize ? ` • ${downloads.windowsSize}` : ''}` : 'Coming Soon'}
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
                      ) : !hasWindowsDownload ? (
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
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
            >
              Download it on the App Store
            </a>
          </motion.p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 px-6 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Get in Touch
            </h2>
            <p className="text-xl text-gray-400">
              Questions, feedback, or just want to say hi? We'd love to hear from you.
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleContactSubmit}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                Message
              </label>
              <textarea
                id="message"
                required
                rows={5}
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
                placeholder="How can we help?"
              />
            </div>
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={contactStatus === 'sending'}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition-all btn-glow disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
              >
                {contactStatus === 'sending' ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Sending...
                  </>
                ) : contactStatus === 'success' ? (
                  <>
                    <Check size={20} />
                    Sent!
                  </>
                ) : contactStatus === 'error' ? (
                  <>
                    <AlertCircle size={20} />
                    Try Again
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Send Message
                  </>
                )}
              </button>
            </div>
            <AnimatePresence>
              {contactStatus === 'success' && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-green-400"
                >
                  Thanks for reaching out! We'll get back to you soon.
                </motion.p>
              )}
              {contactStatus === 'error' && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-red-400"
                >
                  Something went wrong. Please try again or email us directly.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.form>
        </div>
      </section>
    </>
  )
}
