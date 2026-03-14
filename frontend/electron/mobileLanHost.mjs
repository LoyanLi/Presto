import { execSync } from 'node:child_process'
import os from 'node:os'

function normalizeFamily(family) {
  if (family === 4 || family === 'IPv4') {
    return 'IPv4'
  }
  if (family === 6 || family === 'IPv6') {
    return 'IPv6'
  }
  return String(family || '')
}

function isVirtualInterfaceName(name) {
  const normalized = String(name || '').toLowerCase()
  return (
    normalized.startsWith('lo') ||
    normalized.startsWith('utun') ||
    normalized.startsWith('awdl') ||
    normalized.startsWith('llw') ||
    normalized.startsWith('bridge') ||
    normalized.startsWith('vboxnet') ||
    normalized.startsWith('vmnet') ||
    normalized.startsWith('docker') ||
    normalized.startsWith('tap') ||
    normalized.startsWith('tun') ||
    normalized.startsWith('wg')
  )
}

function isLikelyPhysicalInterfaceName(name) {
  return /^(en|eth|wlan|wl)\d+/i.test(String(name || ''))
}

function isUsableIpv4Address(address) {
  if (typeof address !== 'string' || address.length === 0) {
    return false
  }
  if (address.startsWith('127.')) {
    return false
  }
  if (address.startsWith('169.254.')) {
    return false
  }
  if (address.startsWith('198.18.')) {
    return false
  }
  if (address === '0.0.0.0') {
    return false
  }
  return true
}

export function detectDefaultInterfaceName() {
  try {
    const output = execSync('route -n get default', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    const match = output.match(/interface:\s+(\S+)/)
    if (match && match[1]) {
      return match[1].trim()
    }
  } catch {
    // ignore and fallback
  }

  try {
    const output = execSync('ip route show default', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    const match = output.match(/\bdev\s+(\S+)/)
    if (match && match[1]) {
      return match[1].trim()
    }
  } catch {
    // ignore and fallback
  }

  return null
}

export function pickLanIpv4(networkInterfaces, preferredInterfaceName = null) {
  const entries = Object.entries(networkInterfaces || {})
  const candidates = []

  for (const [name, records] of entries) {
    if (!Array.isArray(records)) {
      continue
    }

    for (const record of records) {
      if (!record || typeof record !== 'object') {
        continue
      }
      if (normalizeFamily(record.family) !== 'IPv4') {
        continue
      }
      if (record.internal) {
        continue
      }
      if (!isUsableIpv4Address(record.address)) {
        continue
      }

      candidates.push({
        name,
        address: record.address,
      })
    }
  }

  if (candidates.length === 0) {
    return null
  }

  if (preferredInterfaceName) {
    const preferred = candidates.find((candidate) => candidate.name === preferredInterfaceName)
    if (preferred) {
      return preferred.address
    }
  }

  const physical = candidates.find(
    (candidate) => isLikelyPhysicalInterfaceName(candidate.name) && !isVirtualInterfaceName(candidate.name),
  )
  if (physical) {
    return physical.address
  }

  const nonVirtual = candidates.find((candidate) => !isVirtualInterfaceName(candidate.name))
  if (nonVirtual) {
    return nonVirtual.address
  }

  return candidates[0].address
}

export function resolveMobileLanHost() {
  const interfaces = os.networkInterfaces()
  const preferredInterfaceName = detectDefaultInterfaceName()
  return pickLanIpv4(interfaces, preferredInterfaceName)
}
