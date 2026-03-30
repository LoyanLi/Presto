import { Badge } from './primitives/Badge'
import { Button } from './primitives/Button'
import { Card } from './primitives/Card'
import { EmptyState } from './primitives/EmptyState'
import { IconButton } from './primitives/IconButton'
import { Input } from './primitives/Input'
import { Panel } from './primitives/Panel'
import { Select } from './primitives/Select'
import { StatChip } from './primitives/StatChip'
import { Tabs } from './primitives/Tabs'
import { Textarea } from './primitives/Textarea'
import { FilterBar } from './composites/FilterBar'
import { PageHeader } from './composites/PageHeader'
import { SettingsSection } from './composites/SettingsSection'
import { WorkflowActionBar } from './composites/WorkflowActionBar'
import { WorkflowFrame } from './composites/WorkflowFrame'
import { WorkflowStepper } from './composites/WorkflowStepper'
import { md3ThemeTokens } from './theme/tokens'
import { getThemeMode, initThemeMode, setThemeMode, subscribeThemeMode } from './theme/mode'

export interface PrestoPluginSharedUiApi {
  version: 'presto-radiant-void-v1'
  theme: {
    init(defaultMode?: 'light' | 'dark'): 'light' | 'dark'
    getMode(): 'light' | 'dark'
    setMode(mode: 'light' | 'dark', options?: { persist?: boolean }): void
    subscribeMode(listener: (mode: 'light' | 'dark') => void): () => void
    tokens: typeof md3ThemeTokens
  }
  Badge: typeof Badge
  Button: typeof Button
  Card: typeof Card
  EmptyState: typeof EmptyState
  FilterBar: typeof FilterBar
  IconButton: typeof IconButton
  Input: typeof Input
  PageHeader: typeof PageHeader
  Panel: typeof Panel
  Select: typeof Select
  SettingsSection: typeof SettingsSection
  StatChip: typeof StatChip
  Tabs: typeof Tabs
  Textarea: typeof Textarea
  WorkflowActionBar: typeof WorkflowActionBar
  WorkflowFrame: typeof WorkflowFrame
  WorkflowStepper: typeof WorkflowStepper
}

export function createPluginSharedUiApi(): PrestoPluginSharedUiApi {
  return {
    version: 'presto-radiant-void-v1',
    theme: {
      init: initThemeMode,
      getMode: getThemeMode,
      setMode: setThemeMode,
      subscribeMode: subscribeThemeMode,
      tokens: md3ThemeTokens,
    },
    Badge,
    Button,
    Card,
    EmptyState,
    FilterBar,
    IconButton,
    Input,
    PageHeader,
    Panel,
    Select,
    SettingsSection,
    StatChip,
    Tabs,
    Textarea,
    WorkflowActionBar,
    WorkflowFrame,
    WorkflowStepper,
  }
}
