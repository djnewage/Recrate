import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, Check } from 'lucide-react';

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

function isAppleSilicon(): boolean {
  const isMac =
    navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac');
  if (!isMac) return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext).getParameter(
          debugInfo.UNMASKED_RENDERER_WEBGL
        );
        if (renderer.includes('Apple M') || renderer.includes('Apple GPU')) return true;
      }
    }
  } catch { /* noop */ }
  if (navigator.userAgent.includes('ARM')) return true;
  return false;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function WaveformDecoration({ className = '' }: { className?: string }) {
  const bars = Array.from({ length: 80 }, (_, i) => {
    return 8 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10 + Math.random() * 8;
  });
  return (
    <svg viewBox="0 0 800 60" className={className} preserveAspectRatio="none" fill="none">
      {bars.map((h, i) => (
        <rect key={i} x={i * 10} y={30 - h / 2} width={4} height={h} rx={2} fill="currentColor" />
      ))}
    </svg>
  );
}

const features = [
  { name: 'Transcription', desc: 'GPU-accelerated speech-to-text. English & Spanish, more languages coming.' },
  { name: 'Word-Level Control', desc: 'Toggle words, override censor types per word. Right-click to cycle.' },
  { name: 'Vocal Separation', desc: 'Isolates vocals from instrumentals so censors blend with the mix.' },
  { name: 'Batch Processing', desc: 'Drop multiple files. Process your whole queue in one session.' },
  { name: 'Multiple Censor Types', desc: 'Mute, beep, reverse, tape stop. Mix different styles per word.' },
  { name: 'Real-time Preview', desc: 'Karaoke-style playback with word highlighting. Compare original vs censored.' },
];

export default function CleansePage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [armAsset, setArmAsset] = useState<ReleaseAsset | null>(null);
  const [intelAsset, setIntelAsset] = useState<ReleaseAsset | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('loading');
  const [isSilicon, setIsSilicon] = useState(true);

  useEffect(() => { setIsSilicon(isAppleSilicon()); }, []);

  useEffect(() => {
    fetch('https://api.github.com/repos/djnewage/cleanse/releases/latest')
      .then((res) => {
        if (!res.ok) throw new Error('No release found');
        return res.json();
      })
      .then((data: GitHubRelease) => {
        setRelease(data);
        const arm = data.assets.find((a) => a.name.includes('arm64') && a.name.endsWith('.dmg'));
        const intel = data.assets.find((a) => a.name.includes('x64') && a.name.endsWith('.dmg'));
        if (arm) setArmAsset(arm);
        if (intel) setIntelAsset(intel);
        setDownloadState(arm || intel ? 'ready' : 'idle');
      })
      .catch(() => setDownloadState('idle'));
  }, []);

  const scrollToDownload = () => {
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen cleanse-page overflow-x-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

      {/* ======================== HERO ======================== */}
      <section className="relative min-h-screen flex items-center px-6 pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none">
          <div className="w-[800px] h-[800px] rounded-full bg-cyan-500/[0.04] blur-[150px] translate-x-[200px]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            {/* Small branding */}
            <motion.div
              className="flex items-center gap-2.5 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <img src="/cleanse-logo.png" alt="" className="w-8 h-8 rounded-lg" />
              <span className="text-sm font-medium text-gray-400">Cleanse</span>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight leading-[1.1]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Clean your <span className="gradient-text-cleanse">f***ing</span>
              <br />
              audio.
            </motion.h1>

            <motion.p
              className="text-lg text-gray-400 max-w-md mb-8 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Automatic profanity detection with mute, beep, reverse, and tape stop censors.
              Batch process your whole library. Runs locally on your Mac.
            </motion.p>

            <motion.div
              className="flex flex-col gap-3 items-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <button
                onClick={scrollToDownload}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 transition-all duration-300 cleanse-btn-glow"
              >
                <Download className="w-5 h-5" />
                Download for macOS
              </button>
              <span className="text-sm text-gray-600">
                2 free downloads &middot; 5 exports free &middot; Upgrade when you need more
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
              src="/screenshots/cleanse-queue.png"
              alt="Cleanse batch queue with vocal separation processing"
              className="w-full h-auto"
            />
          </motion.div>
        </div>
      </section>

      {/* ======================== PRODUCT SCREENSHOTS ======================== */}
      <section className="relative px-6 pb-16">
        <div className="max-w-5xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-lg overflow-hidden border border-white/[0.08]">
              <img
                src="/screenshots/cleanse-editor.png"
                alt="Cleanse word-level editor with profanity flagging and playback"
                className="w-full h-auto"
              />
            </div>
            <p className="text-gray-600 text-xs font-mono mt-3">Word-level editor with playback comparison</p>
          </motion.div>
        </div>
      </section>

      {/* ======================== SPECS STRIP ======================== */}
      <section className="px-6 py-10 border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-500 text-xs font-mono tracking-wide text-center md:text-left">
            GPU-accelerated &middot; Local processing &middot; English &amp; Spanish &middot; WAV, MP3, FLAC, OGG, M4A, AAC, WMA
          </p>
        </div>
      </section>

      {/* ======================== FEATURES — Spec List ======================== */}
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
            className="border-l-2 border-cyan-500/30 pl-6 mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xl md:text-2xl text-gray-500 italic leading-relaxed">
              5 exports free. Upgrade when you need more.
            </p>
          </motion.blockquote>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-sm text-gray-500 mb-2">Free</p>
              <p className="text-4xl font-bold text-white mb-6">$0</p>
              <ul className="space-y-3 mb-8">
                {['2 free downloads', '5 free exports', 'All features included', 'Upgrade when you need more'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
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
              className="md:pl-12 md:border-l-2 md:border-cyan-500/20"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <p className="text-sm text-cyan-400 mb-2">Pro</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$9.99</span>
                <span className="text-gray-500 text-sm ml-1">/ month</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['Unlimited exports', 'All features included', 'Priority support'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={scrollToDownload}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 transition-all duration-300 cleanse-btn-glow"
              >
                Download &amp; Subscribe
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ======================== DOWNLOAD ======================== */}
      <section className="relative px-6 py-24 border-t border-white/[0.05]" id="download">
        <WaveformDecoration className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-20 text-white/[0.02] pointer-events-none" />

        <div className="relative max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Requires macOS 13.3 (Ventura) or later</p>

            <AnimatePresence mode="wait">
              {downloadState === 'loading' && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                  <p className="text-gray-500 text-sm">Checking for latest release...</p>
                </motion.div>
              )}

              {downloadState === 'ready' && release && (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    {armAsset && (
                      <a href={armAsset.browser_download_url} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 transition-all duration-300 cleanse-btn-glow">
                        <Download className="w-5 h-5" />
                        Download for Apple Silicon (M1/M2/M3/M4)
                      </a>
                    )}
                    {intelAsset && (
                      <a href={intelAsset.browser_download_url} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-white/[0.05] border border-white/[0.1] hover:border-cyan-500/50 hover:bg-white/[0.08] transition-all duration-300">
                        <Download className="w-5 h-5" />
                        Download for Intel Mac
                      </a>
                    )}
                  </div>
                  <p className="text-gray-600 text-xs font-mono">
                    {release.tag_name}{armAsset && <> &middot; Apple Silicon {formatBytes(armAsset.size)}</>}{intelAsset && <> &middot; Intel {formatBytes(intelAsset.size)}</>}
                  </p>
                  <p className="text-gray-500 text-xs max-w-md">
                    Not sure which to choose? Click <span className="text-gray-300"></span> &rarr; <span className="text-gray-300">About This Mac</span>. If you see &ldquo;Apple M1&rdquo; or later, choose Apple Silicon. Otherwise, choose Intel.
                  </p>
                </motion.div>
              )}

              {downloadState === 'idle' && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-gray-500 bg-white/[0.05] border border-white/[0.07] cursor-default">Coming Soon</div>
                  <p className="text-gray-600 text-xs">The first release is on the way.</p>
                </motion.div>
              )}

              {downloadState === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-red-400 text-sm">Failed to load release info. Try again later.</p>
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
  );
}
