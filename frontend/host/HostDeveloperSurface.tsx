import type { CSSProperties } from 'react'

import type { PluginRuntime, PrestoClient } from '../../packages/contracts/src'
import { Button, ShellSurface } from '../ui'
import { DeveloperCapabilityConsole } from './DeveloperCapabilityConsole'

export interface HostDeveloperSurfaceProps {
  developerPresto: PrestoClient
  developerRuntime: PluginRuntime
  smokeTarget?: string | null
  smokeImportFolder?: string | null
  onOpenSettings(): void
  onGoHome(): void
}

const developerShellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  height: '100vh',
  minHeight: 0,
  overflow: 'hidden',
  padding: 20,
  boxSizing: 'border-box',
}

const developerMainPaneStyle: CSSProperties = {
  display: 'grid',
  minHeight: 0,
  overflow: 'hidden',
}

const developerToolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingBottom: 12,
}

export function HostDeveloperSurface({
  developerPresto,
  developerRuntime,
  smokeTarget,
  smokeImportFolder,
  onOpenSettings: _onOpenSettings,
  onGoHome,
}: HostDeveloperSurfaceProps) {
  return (
    <ShellSurface density="standard" edgeToEdge>
      <div style={developerShellStyle}>
        <div style={developerToolbarStyle}>
          <Button variant="secondary" size="sm" onClick={onGoHome}>
            Home
          </Button>
          <span />
        </div>
        <div style={developerMainPaneStyle}>
          <DeveloperCapabilityConsole
            presto={developerPresto}
            runtime={developerRuntime}
            smokeTarget={smokeTarget}
            smokeImportFolder={smokeImportFolder}
          />
        </div>
      </div>
    </ShellSurface>
  )
}
