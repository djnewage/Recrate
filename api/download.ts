interface GitHubAsset {
  name: string
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

  const url = new URL(req.url)
  const assetName = url.searchParams.get('asset')
  if (!assetName) {
    return new Response(JSON.stringify({ error: 'Missing asset query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Public repo: token optional. Use it if present, otherwise call GitHub
  // unauthenticated so an expired GITHUB_TOKEN doesn't break downloads.
  const token = process.env.GITHUB_TOKEN
  const releaseHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Recrate-Website',
  }
  if (token) releaseHeaders.Authorization = `Bearer ${token}`

  try {
    const response = await fetch(
      'https://api.github.com/repos/djnewage/Recrate/releases/latest',
      { headers: releaseHeaders }
    )

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch release from GitHub' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const release: GitHubRelease = await response.json()
    const asset = release.assets.find((a) => a.name === assetName)

    if (!asset) {
      return new Response(JSON.stringify({ error: 'Asset not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch the asset download URL — GitHub returns a 302 to a temporary S3 URL.
    // Auth is optional for public-repo assets.
    const assetHeaders: Record<string, string> = {
      Accept: 'application/octet-stream',
      'User-Agent': 'Recrate-Website',
    }
    if (token) assetHeaders.Authorization = `Bearer ${token}`

    const downloadResponse = await fetch(asset.browser_download_url, {
      headers: assetHeaders,
      redirect: 'manual',
    })

    // GitHub responds with 302 redirect to S3
    const redirectUrl = downloadResponse.headers.get('location')
    if (redirectUrl) {
      return Response.redirect(redirectUrl, 302)
    }

    // Fallback: redirect to the original URL
    return Response.redirect(asset.browser_download_url, 302)
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to process download' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
