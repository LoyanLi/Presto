import assert from 'node:assert/strict'
import { pickLanIpv4 } from '../electron/mobileLanHost.mjs'

const fixtures = {
  lo0: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
  ],
  bridge0: [
    { address: '192.168.3.1', family: 'IPv4', internal: false },
  ],
  en0: [
    { address: '192.168.4.16', family: 'IPv4', internal: false },
  ],
  utun6: [
    { address: '198.18.0.1', family: 'IPv4', internal: false },
  ],
  bridge100: [
    { address: '192.168.2.1', family: 'IPv4', internal: false },
  ],
}

function run() {
  const selectedWithPreferred = pickLanIpv4(fixtures as any, 'en0')
  assert.equal(selectedWithPreferred, '192.168.4.16', 'should pick default route interface address')

  const selectedWithoutPreferred = pickLanIpv4(fixtures as any, null)
  assert.equal(selectedWithoutPreferred, '192.168.4.16', 'should avoid bridge/tunnel interfaces by default')

  process.stdout.write('PASS mobile lan host selection\n')
}

try {
  run()
} catch (error) {
  process.stderr.write(`FAIL mobile lan host selection: ${String(error)}\n`)
  process.exitCode = 1
}
