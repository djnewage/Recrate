import { useState, type FormEvent } from 'react';
import { Loader2, Mail, Check } from 'lucide-react';
import { trackEvent } from '../utils/metaPixel';
import { utmForTracking, type UtmParams } from '../utils/cleanseAttribution';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

interface Props {
  utm: UtmParams;
  platform: string;
  /** Where on the page the form lives — recorded on the pixel event. */
  placement: 'hero' | 'download';
  className?: string;
}

/**
 * "Email me the download link" form shown to phone visitors, who can't install
 * a desktop app from the device they clicked the ad on.
 */
export default function CleanseSendLink({ utm, platform, placement, className = '' }: Props) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SendState>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError(null);

    const form = e.currentTarget as HTMLFormElement;
    const honeypot = (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';

    try {
      const res = await fetch('/api/cleanse-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot, utm, platform }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

      setState('sent');
      trackEvent('Lead', { content_name: 'Cleanse', placement, platform, ...utmForTracking(utm) });
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (state === 'sent') {
    return (
      <div className={`flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] px-4 py-3.5 ${className}`}>
        <Check className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-white text-sm font-medium">Link sent to {email}</p>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            Open it on your Mac or Windows PC to install. Check spam if it doesn&rsquo;t show up in a minute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`w-full ${className}`} noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={`cleanse-email-${placement}`} className="sr-only">Email address</label>
        <input
          id={`cleanse-email-${placement}`}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full px-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white placeholder:text-gray-500 text-base focus:outline-none focus:border-cyan-500/60 focus:bg-white/[0.08] transition-colors"
        />
        {/* Honeypot: hidden from people, filled by bots. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] w-px h-px opacity-0"
        />
        <button
          type="submit"
          disabled={state === 'sending' || email.trim() === ''}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-400 hover:to-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 cleanse-btn-glow"
        >
          {state === 'sending' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
          {state === 'sending' ? 'Sending…' : 'Email me the download link'}
        </button>
      </div>
      {state === 'error' && error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}
      <p className="text-gray-500 text-xs mt-2 leading-relaxed">
        Cleanse runs on Mac and Windows. We&rsquo;ll send the link so you can install it on your computer. No spam.
      </p>
    </form>
  );
}
