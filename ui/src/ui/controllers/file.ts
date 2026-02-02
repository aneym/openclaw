/**
 * File read/write for the artifact panel.
 */

export interface FileReadResult {
  content: string
  size: number
  mtime: number
  truncated: boolean
}

export async function fetchFileContent(
  basePath: string,
  filePath: string,
  password: string,
): Promise<FileReadResult> {
  const url = new URL(`${basePath}/api/file/read`, window.location.origin)
  url.searchParams.set('path', filePath)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${password}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Failed to load file: ${res.statusText}`)
  }
  return res.json()
}

export async function writeFileContent(
  basePath: string,
  filePath: string,
  content: string,
  password: string,
): Promise<{ ok: boolean; size: number; mtime: number }> {
  const url = new URL(`${basePath}/api/file/write`, window.location.origin)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${password}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: filePath, content }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Failed to save file: ${res.statusText}`)
  }
  return res.json()
}
