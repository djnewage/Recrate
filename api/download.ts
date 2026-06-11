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

  // Public repo: token optional. Use it if present, but if the authenticated
  // call fails (e.g. expired/invalid token), retry unauthenticated so a bad
  // GITHUB_TOKEN doesn't break downloads. `useToken` tracks the working mode so
  // the asset fetch uses the same one.
  const token = process.env.GITHUB_TOKEN
  let useToken = !!token

  const ghFetch = (url: string, accept: string, manualRedirect = false) => {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'Recrate-Website',
    }
    if (useToken && token) headers.Authorization = `Bearer ${token}`
    return fetch(url, manualRedirect ? { headers, redirect: 'manual' } : { headers })
  }

  try {
    const releaseUrl = 'https://api.github.com/repos/djnewage/Recrate/releases/latest'
    let response = await ghFetch(releaseUrl, 'application/vnd.github+json')
    if (!response.ok && token) {
      useToken = false
      response = await ghFetch(releaseUrl, 'application/vnd.github+json')
    }

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
    // Use whichever auth mode worked above.
    const downloadResponse = await ghFetch(
      asset.browser_download_url,
      'application/octet-stream',
      true
    )

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
