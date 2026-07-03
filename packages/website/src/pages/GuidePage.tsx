import { motion } from 'framer-motion'
import {
  Download,
  FolderCog,
  Radio,
  Smartphone,
  ScanLine,
  Library,
  Layers,
  Search,
  Sparkles,
  Wifi,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'

// The three layers of Recrate — helps set the mental model before the steps.
const layers = [
  {
    icon: Radio,
    title: 'Desktop server',
    description:
      'Runs on your computer, reads your Serato library, and streams your real audio files. Your music never leaves your machine — nothing is uploaded to the cloud.',
  },
  {
    icon: ScanLine,
    title: 'Connection',
    description:
      'Your phone pairs with the desktop by scanning a QR code. Fastest on the same Wi-Fi, and it also works remotely over 5G / mobile data.',
  },
  {
    icon: Smartphone,
    title: 'Mobile app',
    description:
      'Browse, search, preview, and build crates from your pocket. Crate changes sync straight back to Serato DJ.',
  },
]

// The core walk-through, in order. `image` points at /public/screenshots.
const steps = [
  {
    icon: Download,
    title: 'Install the desktop app',
    body: [
      'Download Recrate for macOS (Apple Silicon or Intel) or Windows from the download page.',
      'On macOS, if you see a Gatekeeper warning the first time, right-click the app and choose Open.',
    ],
    image: null,
  },
  {
    icon: FolderCog,
    title: 'Point Recrate at your library',
    body: [
      'On first launch, a quick setup wizard auto-detects your Serato library — even on external drives — so you can just pick it.',
      'Then choose the folder where your music files live. Recrate reads your crates, playlists, and track analysis; it never modifies your audio.',
    ],
    image: '/screenshots/connect.png',
  },
  {
    icon: Radio,
    title: 'Start the server',
    body: [
      'Recrate starts a local server and shows a QR code. Keep the app running while you play — your phone streams from it.',
      'Same Wi-Fi is fastest. Away from home? It still works over 5G / mobile data.',
    ],
    image: null,
  },
  {
    icon: Smartphone,
    title: 'Get the mobile app',
    body: [
      'Download Recrate from the App Store on your phone and sign in with your account.',
    ],
    image: null,
  },
  {
    icon: ScanLine,
    title: 'Scan to connect',
    body: [
      'Open the mobile app and scan the QR code shown on your desktop (or tap “Enter IP” to type the address).',
      'That’s it — your phone and desktop are paired.',
    ],
    image: null,
  },
  {
    icon: Library,
    title: 'Browse, filter & play',
    body: [
      'Your whole library is now on your phone. Search and sort instantly, and filter by BPM, key, or genre.',
      'Preview any track with the colored waveform and Serato-accurate beat grid before you commit.',
    ],
    image: '/screenshots/filters.png',
  },
  {
    icon: Layers,
    title: 'Build & sync crates',
    body: [
      'Create crates, bulk-select tracks, and add them on the fly from anywhere.',
      'Everything syncs back to Serato DJ — just restart Serato to see your new crates and changes.',
    ],
    image: '/screenshots/crates.png',
  },
]

// Highlighted power features, shown after the core walk-through.
const powerFeatures = [
  {
    icon: Search,
    title: 'Track Identify',
    description:
      'Hear a track out and want it in your set? Identify it and jump straight to it in your library.',
    image: '/screenshots/track-identify.png',
  },
  {
    icon: Sparkles,
    title: 'Recrate Builder (AI)',
    description:
      'Describe the vibe of your set and let AI assemble a crate for you — with a reason for every pick.',
    image: '/screenshots/recrate-builder.png',
  },
]

// Quick “good to know” notes.
const tips = [
  {
    icon: Wifi,
    title: 'Keep the desktop running',
    description: 'Streaming needs the desktop app open. Close it and playback stops.',
  },
  {
    icon: ShieldCheck,
    title: 'Your music stays yours',
    description: 'Audio streams peer-to-peer from your computer. Nothing is uploaded to the cloud.',
  },
  {
    icon: RefreshCw,
    title: 'Sync back to Serato',
    description: 'Crate edits write back to Serato DJ — restart Serato to see them. Offline edits sync on reconnect.',
  },
]

export default function GuidePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="px-6 pt-32 pb-16 bg-gradient-to-b from-black to-zinc-900">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              How to <span className="gradient-text">Use Recrate</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Stream your Serato library to your phone and build crates from anywhere.
              Here’s the whole flow, start to finish.
            </p>
          </motion.div>
        </div>
      </section>

      {/* How it fits together */}
      <section className="py-20 px-6 bg-zinc-900">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How it <span className="gradient-text">fits together</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Recrate has three pieces working together.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {layers.map((layer, index) => (
              <motion.div
                key={layer.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 text-center"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                  <layer.icon size={32} className="text-purple-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{layer.title}</h3>
                <p className="text-gray-400 text-sm">{layer.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Step-by-step */}
      <section className="py-20 px-6 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Step <span className="gradient-text">by step</span>
            </h2>
          </motion.div>

          <div className="flex flex-col gap-6">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: (index % 3) * 0.1 }}
                className="relative p-6 md:p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 hover:border-purple-500/50 transition-all"
              >
                {/* Step number */}
                <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold shadow-lg">
                  {index + 1}
                </div>

                <div className="flex flex-col md:flex-row gap-6 md:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                        <step.icon size={22} className="text-purple-400" />
                      </div>
                      <h3 className="text-xl font-bold">{step.title}</h3>
                    </div>
                    <ul className="space-y-2">
                      {step.body.map((line, i) => (
                        <li key={i} className="text-gray-400 flex gap-2">
                          <span className="text-purple-400 mt-1">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {step.image && (
                    <div className="md:w-64 shrink-0">
                      <img
                        src={step.image}
                        alt={step.title}
                        loading="lazy"
                        className="w-full rounded-xl border border-white/10 shadow-lg"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Power features */}
      <section className="py-20 px-6 bg-zinc-900">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Once you’re <span className="gradient-text">connected</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Two features worth trying right away.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {powerFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 hover:border-purple-500/50 transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <feature.icon size={24} className="text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold">{feature.title}</h3>
                </div>
                <p className="text-gray-400 mb-5">{feature.description}</p>
                <img
                  src={feature.image}
                  alt={feature.title}
                  loading="lazy"
                  className="w-full rounded-xl border border-white/10 shadow-lg"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Good to know */}
      <section className="py-20 px-6 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold">
              Good to <span className="gradient-text">know</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {tips.map((tip, index) => (
              <motion.div
                key={tip.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                  <tip.icon size={24} className="text-purple-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{tip.title}</h3>
                <p className="text-gray-400 text-sm">{tip.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-black text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to <span className="gradient-text">get started?</span>
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            Download the desktop app and connect your phone in minutes.
          </p>
          <a
            href="/#download"
            className="btn-glow inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 font-semibold text-lg hover:scale-105 transition-transform"
          >
            <Download size={20} />
            Download Recrate
          </a>
        </motion.div>
      </section>
    </div>
  )
}
