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

  // Recrate is a public repo, so the token is optional: use it when present
  // (higher rate limit), otherwise fall back to unauthenticated requests so a
  // missing/expired GITHUB_TOKEN doesn't take the download buttons offline.
  const token = process.env.GITHUB_TOKEN
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Recrate-Website',
  }
  if (token) ghHeaders.Authorization = `Bearer ${token}`

  try {
    const response = await fetch(
      'https://api.github.com/repos/djnewage/Recrate/releases/latest',
      { headers: ghHeaders }
    )

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
