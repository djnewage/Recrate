interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Recrate is a public repo, so the token is optional. Use it when present
  // (higher rate limit), but if the authenticated call fails — e.g. the token
  // is expired/invalid (401/403) — retry unauthenticated so a bad GITHUB_TOKEN
  // can't take the download buttons offline.
  const token = process.env.GITHUB_TOKEN
  const releaseUrl = 'https://api.github.com/repos/djnewage/Recrate/releases/latest'

  const ghFetch = (withToken: boolean) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Recrate-Website',
    }
    if (withToken && token) headers.Authorization = `Bearer ${token}`
    return fetch(releaseUrl, { headers })
  }

  try {
    let response = await ghFetch(true)
    if (!response.ok && token) {
      response = await ghFetch(false)
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch release from GitHub' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const release: GitHubRelease = await response.json()

    const assets = release.assets.map((asset) => ({
      name: asset.name,
      size: asset.size,
      downloadUrl: `/api/download?asset=${encodeURIComponent(asset.name)}`,
    }))

    return new Response(JSON.stringify({ version: release.tag_name, assets }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch release' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
