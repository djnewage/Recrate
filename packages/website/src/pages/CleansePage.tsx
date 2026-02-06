import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, VolumeX, ToggleLeft, Music, Layers, Play, Download, Loader2 } from 'lucide-react';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

type DownloadState = 'idle' | 'loading' | 'ready' | 'error';

const features = [
  {
    icon: Mic,
    title: 'AI Transcription',
    description: 'GPU-accelerated speech-to-text transcription of your audio files.',
  },
  {
    icon: VolumeX,
    title: 'Multiple Censor Types',
    description:
      'Choose from mute, beep, reverse, or tape stop effects. Apply different censor styles per word.',
  },
  {
    icon: ToggleLeft,
    title: 'Word-Level Control',
    description:
      'Toggle individual words on or off. Override the censor type for any specific word in the transcript.',
  },
  {
    icon: Music,
    title: 'Vocal Separation',
    description: 'AI isolates vocals from instrumentals so censors blend seamlessly with the mix.',
  },
  {
    icon: Layers,
    title: 'Batch Processing',
    description:
      'Drop multiple files at once and process them all in a single session. Queue up an entire project.',
  },
  {
    icon: Play,
    title: 'Real-time Preview',
    description:
      'Karaoke-style playback with word highlighting so you can hear exactly how the censored audio will sound.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Drop your audio files',
    description:
      'Drag and drop one or more audio files into Cleanse. Supports WAV, MP3, FLAC, and more.',
  },
  {
    number: '02',
    title: 'Review & edit the transcript',
    description:
      'The AI transcribes your audio. Toggle words, change censor types, and fine-tune the result.',
  },
  {
    number: '03',
    title: 'Export your clean version',
    description: 'Hit export and get your censored audio file, ready to distribute or publish.',
  },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function CleansePage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [dmgAsset, setDmgAsset] = useState<ReleaseAsset | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('loading');

  useEffect(() => {
    fetch('https://api.github.com/repos/djnewage/cleanse/releases/latest')
      .then((res) => {
        if (!res.ok) throw new Error('No release found');
        return res.json();
      })
      .then((data: GitHubRelease) => {
        setRelease(data);
        const dmg = data.assets.find((a) => a.name.endsWith('.dmg'));
        if (dmg) {
          setDmgAsset(dmg);
          setDownloadState('ready');
        } else {
          setDownloadState('idle');
        }
      })
      .catch(() => {
        setDownloadState('idle');
      });
  }, []);

  const scrollToDownload = () => {
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen cleanse-page">
      {/* Noise overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

      {/* ======================== HERO ======================== */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Background radial glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src="/cleanse-logo.png"
              alt="Cleanse"
              className="w-28 h-28 mx-auto mb-8 rounded-3xl cleanse-glow"
            />
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            Clean audio, <span className="gradient-text-cleanse">automatically</span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            AI-powered profanity detection and censoring for audio files. Transcribe, review, and
            export — all on your machine.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <button
              onClick={scrollToDownload}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 transition-all duration-300 cleanse-btn-glow"
            >
              <Download className="w-5 h-5" />
              Download for macOS
            </button>
          </motion.div>
        </div>
      </section>

      {/* ======================== PREVIEW ======================== */}
      <section className="relative px-6 pb-24 -mt-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono uppercase tracking-widest text-cyan-400 mb-3">
              Preview
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              See it in <span className="gradient-text-cleanse">action</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              className="rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.02]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <img
                src="/cleanse-screenshot-1.png"
                alt="Cleanse — batch processing queue with drag-and-drop"
                className="w-full h-auto"
              />
            </motion.div>
            <motion.div
              className="rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.02]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <img
                src="/cleanse-screenshot-2.png"
                alt="Cleanse — word-level transcript editor with profanity flagging"
                className="w-full h-auto"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ======================== FEATURES ======================== */}
      <section className="relative px-6 py-24" id="features">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono uppercase tracking-widest text-cyan-400 mb-3">
              Features
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Everything you need to <span className="gradient-text-cleanse">censor audio</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:border-cyan-500/30 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-cyan-500 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-mono text-sm font-semibold text-white mb-2 tracking-wide">
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================== HOW IT WORKS ======================== */}
      <section className="relative px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono uppercase tracking-widest text-cyan-400 mb-3">
              Workflow
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Three steps to <span className="gradient-text-cleanse">clean audio</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-[52px] left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-orange-500/40 via-cyan-500/40 to-orange-500/40" />

            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                className="relative text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
              >
                <div className="w-[104px] h-[104px] rounded-full bg-gradient-to-br from-orange-500 to-cyan-500 p-[2px] mx-auto mb-6">
                  <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center">
                    <span className="font-mono text-2xl font-bold gradient-text-cleanse">
                      {step.number}
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-white text-lg mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================== DOWNLOAD ======================== */}
      <section className="relative px-6 py-24" id="download">
        <div className="max-w-2xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono uppercase tracking-widest text-cyan-400 mb-3">
              Download
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Get <span className="gradient-text-cleanse">Cleanse</span>
            </h2>
          </motion.div>

          <motion.div
            className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* macOS icon */}
            <div className="flex justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </div>

            <h3 className="text-xl font-semibold text-white mb-1">macOS</h3>
            <p className="text-gray-500 text-xs font-mono mb-6">
              macOS 12+ &middot; Universal (Intel + Apple Silicon)
            </p>

            <AnimatePresence mode="wait">
              {downloadState === 'loading' && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                  <p className="text-gray-500 text-sm">Checking for latest release...</p>
                </motion.div>
              )}

              {downloadState === 'ready' && dmgAsset && release && (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4"
                >
                  <a
                    href={dmgAsset.browser_download_url}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 transition-all duration-300 cleanse-btn-glow"
                  >
                    <Download className="w-5 h-5" />
                    Download DMG
                  </a>
                  <p className="text-gray-600 text-xs font-mono">
                    {release.tag_name} &middot; {formatBytes(dmgAsset.size)}
                  </p>
                </motion.div>
              )}

              {downloadState === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-gray-500 bg-white/[0.05] border border-white/[0.07] cursor-default">
                    Coming Soon
                  </div>
                  <p className="text-gray-600 text-xs">The first release is on the way.</p>
                </motion.div>
              )}

              {downloadState === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <p className="text-red-400 text-sm">
                    Failed to load release info. Try again later.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ======================== BUILT BY ======================== */}
      <section className="px-6 py-12 text-center">
        <p className="text-gray-600 text-xs font-mono tracking-wide">Built by Recrate LLC</p>
      </section>
    </div>
  );
}
