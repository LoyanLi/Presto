#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const requirementsPath = path.join(
  repoRoot,
  'backend',
  'presto',
  'integrations',
  'daw',
  'ptsl_requirements.json',
)
const VERSION_PATTERN = /^\d{4}\.\d{1,2}\.\d+$/

function parseArgs(argv) {
  const args = { sdkRoot: process.env.PRESTO_PTSL_SDK_ROOT || '' }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--sdk-root') {
      args.sdkRoot = argv[index + 1] || ''
      index += 1
    }
  }
  if (!args.sdkRoot) {
    throw new Error('PTSL SDK root is required via --sdk-root or PRESTO_PTSL_SDK_ROOT')
  }
  return args
}

function readOpsExports(opsInitSource) {
  const exported = new Set()
  const matches = opsInitSource.matchAll(/\b(CId_[A-Za-z0-9_]+)\b/g)
  for (const match of matches) {
    exported.add(match[1])
  }
  return exported
}

function normalizeCategory(comment) {
  const matches = [...comment.matchAll(/@category_([A-Za-z0-9_]+)/g)].map((match) => match[1])
  const preferred = matches.find((value) => value !== 'all')
  return preferred || matches[0] || null
}

function normalizeSince(comment) {
  const match = comment.match(/@since Pro Tools ([0-9.]+)/)
  if (!match) {
    return null
  }
  const parts = match[1].split('.').filter(Boolean)
  while (parts.length < 3) {
    parts.push('0')
  }
  return parts.slice(0, 3).join('.')
}

function parseVersion(value) {
  if (!VERSION_PATTERN.test(value)) {
    return null
  }
  return value.split('.').map((piece) => Number.parseInt(piece, 10))
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  if (!leftParts || !rightParts) {
    throw new Error(`Cannot compare invalid versions: ${left}, ${right}`)
  }
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1
    }
  }
  return 0
}

function readCommandMinimumHostVersionOverrides() {
  const requirements = JSON.parse(fs.readFileSync(requirementsPath, 'utf8'))
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new Error('ptsl_requirements.json must be an object')
  }
  const raw = requirements.commandMinimumHostVersionOverrides
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('ptsl_requirements.json commandMinimumHostVersionOverrides must be an object')
  }
  for (const [commandName, version] of Object.entries(raw)) {
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
      throw new Error(
        `ptsl_requirements.json commandMinimumHostVersionOverrides.${commandName} must use YYYY.MM.PATCH format`,
      )
    }
  }
  return raw
}

function applyMinimumHostVersions(entries, commandMinimums) {
  const names = new Set(entries.map((entry) => entry.command_name))
  for (const commandName of Object.keys(commandMinimums)) {
    if (!names.has(commandName)) {
      throw new Error(`ptsl_requirements.json commandMinimumHostVersionOverrides contains unknown command ${commandName}`)
    }
  }

  return entries.map((entry) => {
    const override = commandMinimums[entry.command_name]
    const minimum = override || entry.sdk_minimum_host_version
    if (!minimum) {
      throw new Error(`PTSL command ${entry.command_name} is missing minimum host version`)
    }
    if (entry.sdk_minimum_host_version && compareVersions(minimum, entry.sdk_minimum_host_version) < 0) {
      throw new Error(
        `PTSL command ${entry.command_name} minimum ${minimum} is below SDK since ${entry.sdk_minimum_host_version}`,
      )
    }
    return {
      ...entry,
      minimum_host_version: minimum,
    }
  })
}

function normalizeMessageName(value) {
  if (!value) {
    return null
  }
  if (value === 'CanceBatchJobRequestBody') {
    return 'CancelBatchJobRequestBody'
  }
  return value
}

function parseProto(protoSource) {
  const entries = []
  const regex = /\/\*\*([\s\S]*?)\*\/\s*CId_([A-Za-z0-9_]+)\s*=\s*(\d+);/g
  for (const match of protoSource.matchAll(regex)) {
    const comment = match[1]
    const name = `CId_${match[2]}`
    const requestMatch = comment.match(/@request_body_type\s+([A-Za-z0-9_]+)/)
    const responseMatch = comment.match(/@response_body_type\s+([A-Za-z0-9_]+)/)
    entries.push({
      command_name: name,
      command_id: Number.parseInt(match[3], 10),
      request_message: normalizeMessageName(requestMatch ? requestMatch[1] : null),
      response_message: normalizeMessageName(responseMatch ? responseMatch[1] : null),
      category: normalizeCategory(comment),
      sdk_minimum_host_version: normalizeSince(comment),
    })
  }
  entries.sort((left, right) => left.command_id - right.command_id)
  return entries
}

function writeGeneratedCatalog(entries, outputPath) {
  const lines = [
    '"""Auto-generated from PTSL.proto; do not edit by hand."""',
    'from __future__ import annotations',
    '',
    'PTSL_COMMAND_CATALOG = (',
  ]

  for (const entry of entries) {
    lines.push('    {')
    lines.push(`        "command_name": ${JSON.stringify(entry.command_name)},`)
    lines.push(`        "command_id": ${entry.command_id},`)
    lines.push(`        "request_message": ${entry.request_message === null ? 'None' : JSON.stringify(entry.request_message)},`)
    lines.push(`        "response_message": ${entry.response_message === null ? 'None' : JSON.stringify(entry.response_message)},`)
    lines.push(`        "has_py_ptsl_op": ${entry.has_py_ptsl_op ? 'True' : 'False'},`)
    lines.push(`        "category": ${entry.category === null ? 'None' : JSON.stringify(entry.category)},`)
    lines.push(`        "minimum_host_version": ${JSON.stringify(entry.minimum_host_version)},`)
    lines.push('    },')
  }

  lines.push(')')
  lines.push('')
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const protoPath = path.join(args.sdkRoot, 'Source', 'PTSL.proto')
  const opsInitPath = '/Library/Frameworks/Python.framework/Versions/3.13/lib/python3.13/site-packages/ptsl/ops/__init__.py'
  const protoSource = fs.readFileSync(protoPath, 'utf8')
  const opsSource = fs.readFileSync(opsInitPath, 'utf8')
  const exportedOps = readOpsExports(opsSource)
  const entries = applyMinimumHostVersions(
    parseProto(protoSource).map((entry) => ({
      ...entry,
      has_py_ptsl_op: exportedOps.has(entry.command_name),
    })),
    readCommandMinimumHostVersionOverrides(),
  )
  const outputPath = path.join(repoRoot, 'backend', 'presto', 'integrations', 'daw', 'ptsl_catalog_generated.py')
  writeGeneratedCatalog(entries, outputPath)
  console.log(`Generated ${entries.length} PTSL command entries at ${outputPath}`)
}

main()
