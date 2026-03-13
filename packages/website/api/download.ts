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

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/djnewage/Recrate/releases/latest',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Recrate-Website',
        },
      }
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

    // Fetch the asset download URL with auth — GitHub returns a 302 to a temporary S3 URL
    const downloadResponse = await fetch(asset.browser_download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/octet-stream',
        'User-Agent': 'Recrate-Website',
      },
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
