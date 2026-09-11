// POST /api/cleanse-lead
//
// Mobile visitors to /cleanse can't install a desktop app, so the landing page
// lets them email themselves the download links instead. This function sends
// that email through Resend and (optionally) adds the address to a Resend
// audience so leads can be matched against later signups.
//
// Env:
//   RESEND_API_KEY      required — nothing is sent without it (returns 503)
//   CLEANSE_MAIL_FROM   optional — defaults to "Cleanse <cleanse@recrate.app>"
//   RESEND_AUDIENCE_ID  optional — when set, the lead is stored as a contact
//   GITHUB_TOKEN        optional — higher rate limit for the release lookup

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}

interface LeadBody {
  email?: unknown
  website?: unknown // honeypot — real users never fill this
  utm?: Record<string, unknown>
  platform?: unknown
}

export const config = { runtime: 'edge' }

const LANDING_URL = 'https://www.recrate.app/cleanse'
const RELEASE_URL = 'https://api.github.com/repos/djnewage/cleanse/releases/latest'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

// Resend tag values only allow ASCII letters, numbers, underscores and dashes.
function tagValue(value: unknown): string {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 100) || 'none'
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Recrate-Website',
  }
  try {
    let res = await fetch(RELEASE_URL, { headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers })
    if (!res.ok && token) res = await fetch(RELEASE_URL, { headers })
    if (!res.ok) return null
    return (await res.json()) as GitHubRelease
  } catch {
    return null
  }
}

function buildEmail(release: GitHubRelease | null) {
  const assets = release?.assets ?? []
  const arm = assets.find((a) => a.name.includes('arm64') && a.name.endsWith('.dmg'))
  const intel = assets.find((a) => a.name.includes('x64') && a.name.endsWith('.dmg'))
  const win = assets.find((a) => a.name.endsWith('.exe'))

  const links: { label: string; url: string; note: string }[] = []
  if (arm) links.push({ label: 'Download for Mac (Apple Silicon)', url: arm.browser_download_url, note: 'M1, M2, M3, M4 Macs' })
  if (intel) links.push({ label: 'Download for Mac (Intel)', url: intel.browser_download_url, note: 'Macs from 2020 and earlier' })
  if (win) links.push({ label: 'Download for Windows', url: win.browser_download_url, note: 'Windows 10 / 11, 64-bit' })

  const version = release?.tag_name ? ` (${release.tag_name})` : ''

  const text = [
    'Here is your Cleanse download link.',
    '',
    'Cleanse runs on Mac and Windows, so open this email on your computer and pick your download:',
    '',
    ...links.map((l) => `${l.label} — ${l.note}\n${l.url}`),
    ...(links.length ? [''] : []),
    `Or grab it from the site any time: ${LANDING_URL}`,
    '',
    'Not sure which Mac you have? Click the Apple menu > About This Mac. If it says Apple M1 or later, choose Apple Silicon.',
    '',
    'Your first 2 exports are free. Reply to this email if anything gives you trouble.',
    '',
    '— Tristan, Cleanse by Recrate',
  ].join('\n')

  const buttons = links
    .map(
      (l) => `
        <tr><td style="padding:0 0 12px 0;">
          <a href="${l.url}" style="display:block;background:#111;color:#fff;text-decoration:none;padding:14px 18px;border-radius:10px;font-weight:600;font-size:15px;">${l.label}</a>
          <div style="color:#777;font-size:12px;padding:6px 2px 0;">${l.note}</div>
        </td></tr>`
    )
    .join('')

  const html = `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:32px;">
        <tr><td style="font-size:22px;font-weight:700;padding-bottom:8px;">Your Cleanse download${version}</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#444;padding-bottom:24px;">
          Cleanse runs on Mac and Windows. Open this email on your computer and pick your download.
        </td></tr>
        ${buttons}
        <tr><td style="font-size:13px;line-height:1.5;color:#666;padding-top:12px;">
          Not sure which Mac you have? Click the Apple menu &rsaquo; About This Mac. If it says Apple&nbsp;M1 or later, choose Apple Silicon.
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.5;color:#666;padding-top:16px;">
          Or grab it from the site any time: <a href="${LANDING_URL}" style="color:#111;">${LANDING_URL.replace('https://', '')}</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.5;color:#666;padding-top:24px;border-top:1px solid #eee;margin-top:24px;">
          Your first 2 exports are free. Reply to this email if anything gives you trouble.<br><br>
          &mdash; Tristan, Cleanse by Recrate
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject: 'Your Cleanse download link', text, html }
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return json(503, { error: 'Email delivery is not configured' })

  let body: LeadBody
  try {
    body = (await req.json()) as LeadBody
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  // Honeypot: bots fill every field; the form renders this one off-screen.
  if (typeof body.website === 'string' && body.website.trim() !== '') return json(200, { ok: true })

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return json(400, { error: 'Enter a valid email address' })

  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const v = body.utm?.[key]
    if (typeof v === 'string' && v.trim()) utm[key] = v.trim().slice(0, 200)
  }
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 50) : 'unknown'

  const release = await fetchLatestRelease()
  const { subject, text, html } = buildEmail(release)
  const from = process.env.CLEANSE_MAIL_FROM || 'Cleanse <cleanse@recrate.app>'

  const tags = [
    { name: 'product', value: 'cleanse' },
    { name: 'kind', value: 'download_link' },
    { name: 'platform', value: tagValue(platform) },
    ...Object.entries(utm).map(([k, v]) => ({ name: k, value: tagValue(v) })),
  ]

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], reply_to: process.env.CLEANSE_REPLY_TO || 'djnewage1220@recrate.app', subject, text, html, tags }),
  })

  if (!sendRes.ok) {
    const detail = await sendRes.text().catch(() => '')
    console.error('[cleanse-lead] Resend send failed', sendRes.status, detail)
    return json(502, { error: 'Could not send the email right now. Please try again.' })
  }

  // Store the lead so it can be matched against signups later. Best effort:
  // a failure here must not turn a delivered email into a user-facing error.
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (audienceId) {
    try {
      await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false }),
      })
    } catch (err) {
      console.error('[cleanse-lead] audience add failed', err)
    }
  }

  console.log('[cleanse-lead] sent', JSON.stringify({ email, platform, utm, version: release?.tag_name ?? null }))
  return json(200, { ok: true })
}
