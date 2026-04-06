export interface UpdateReleaseInfo {
  tagName: string
  name: string
  htmlUrl: string
  publishedAt: string
  prerelease: boolean
  draft: boolean
}

export interface UpdateCheckResult {
  currentVersion: string
  hasUpdate: boolean
  latestRelease: (UpdateReleaseInfo & { repo: string }) | null
}

type ParsedVersion = {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string> | null
}

function normalizeVersion(raw: string): string {
  return String(raw || '').trim().replace(/^v/i, '')
}

function parseVersion(raw: string): ParsedVersion | null {
  const normalized = normalizeVersion(raw)
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) {
    return null
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4]
      ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part))
      : null,
  }
}

function comparePrereleaseIdentifier(left: number | string, right: number | string): number {
  const leftIsNumber = typeof left === 'number'
  const rightIsNumber = typeof right === 'number'
  if (leftIsNumber && rightIsNumber) {
    return left - right
  }
  if (leftIsNumber) {
    return -1
  }
  if (rightIsNumber) {
    return 1
  }
  return String(left).localeCompare(String(right))
}

export function compareVersions(leftRaw: string, rightRaw: string): number | null {
  const left = parseVersion(leftRaw)
  const right = parseVersion(rightRaw)
  if (!left || !right) {
    return null
  }

  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch
  if (!left.prerelease && !right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier)
    if (compared !== 0) {
      return compared
    }
  }

  return 0
}

export function selectLatestRelease(
  releases: readonly UpdateReleaseInfo[],
  options: { includePrerelease: boolean },
): UpdateReleaseInfo | null {
  let latestRelease: UpdateReleaseInfo | null = null

  for (const release of releases) {
    if (release.draft) {
      continue
    }
    if (!options.includePrerelease && release.prerelease) {
      continue
    }
    if (!parseVersion(release.tagName)) {
      continue
    }
    if (!latestRelease) {
      latestRelease = release
      continue
    }
    const compared = compareVersions(release.tagName, latestRelease.tagName)
    if (compared !== null && compared > 0) {
      latestRelease = release
    }
  }

  return latestRelease
}

export function createUpdateCheckResult(input: {
  currentVersion: string
  repo: string
  releases: readonly UpdateReleaseInfo[]
  includePrerelease: boolean
}): UpdateCheckResult {
  const latestRelease = selectLatestRelease(input.releases, {
    includePrerelease: input.includePrerelease,
  })
  const compared = latestRelease ? compareVersions(latestRelease.tagName, input.currentVersion) : null

  return {
    currentVersion: input.currentVersion,
    hasUpdate: compared !== null ? compared > 0 : false,
    latestRelease: latestRelease
      ? {
          repo: input.repo,
          ...latestRelease,
        }
      : null,
  }
}

export async function fetchGithubUpdateCheck(input: {
  currentVersion: string
  includePrerelease: boolean
  repo?: string
}): Promise<UpdateCheckResult> {
  const repo = input.repo || process.env.PRESTO_GITHUB_REPO || 'LoyanLi/Presto'
  const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Presto-App',
    },
  })

  if (!response.ok) {
    throw new Error(`github_release_fetch_failed:${response.status}`)
  }

  const payload = await response.json()
  const releases = Array.isArray(payload)
    ? payload.map((item) => ({
        tagName: typeof item?.tag_name === 'string' ? item.tag_name : '',
        name: typeof item?.name === 'string' ? item.name : '',
        htmlUrl: typeof item?.html_url === 'string' ? item.html_url : '',
        publishedAt: typeof item?.published_at === 'string' ? item.published_at : '',
        prerelease: Boolean(item?.prerelease),
        draft: Boolean(item?.draft),
      }))
    : []

  return createUpdateCheckResult({
    currentVersion: input.currentVersion,
    repo,
    releases,
    includePrerelease: input.includePrerelease,
  })
}
