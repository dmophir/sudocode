import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Loader2,
  AlertCircle,
  Trash2,
  Settings,
  BarChart3,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { patternsApi } from '@/lib/api'
import type { Pattern, AutoResponseConfig, AutoResponseStats } from '@/types/api'
import { formatDistanceToNow } from 'date-fns'

export function PatternsManager() {
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [config, setConfig] = useState<AutoResponseConfig | null>(null)
  const [stats, setStats] = useState<AutoResponseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orderBy, setOrderBy] = useState<'confidence' | 'occurrences' | 'recent'>('confidence')
  const [autoResponseOnly, setAutoResponseOnly] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [patternsData, configData, statsData] = await Promise.all([
        patternsApi.getAll({ orderBy, autoResponseOnly }),
        patternsApi.getConfig(),
        patternsApi.getStats(),
      ])
      setPatterns(patternsData)
      setConfig(configData)
      setStats(statsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patterns')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orderBy, autoResponseOnly])

  const handleToggleAutoResponse = async (patternId: string, enabled: boolean) => {
    try {
      setError(null)
      await patternsApi.setAutoResponse(patternId, enabled)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pattern')
    }
  }

  const handleDeletePattern = async (patternId: string) => {
    if (!confirm('Are you sure you want to delete this pattern?')) return

    try {
      setError(null)
      await patternsApi.delete(patternId)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pattern')
    }
  }

  const handleUpdateConfig = async (updates: Partial<AutoResponseConfig>) => {
    if (!config) return

    try {
      setError(null)
      await patternsApi.updateConfig(updates)
      setConfig({ ...config, ...updates })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration')
    }
  }

  if (loading && !patterns.length) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading patterns">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="orderBy">Sort by:</Label>
            <Select value={orderBy} onValueChange={(v: any) => setOrderBy(v)}>
              <SelectTrigger id="orderBy" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="occurrences">Occurrences</SelectItem>
                <SelectItem value="recent">Most Recent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="autoResponseOnly"
              checked={autoResponseOnly}
              onCheckedChange={setAutoResponseOnly}
            />
            <Label htmlFor="autoResponseOnly">Auto-response enabled only</Label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStatsDialogOpen(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Statistics
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </Button>
        </div>
      </div>

      {patterns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No patterns found</p>
            <p className="text-sm mt-2">
              {autoResponseOnly
                ? 'No patterns have auto-response enabled'
                : 'Patterns will appear as agents learn from your responses'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {patterns.map((pattern) => (
            <Card key={pattern.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="outline">{pattern.request_type}</Badge>
                      {pattern.suggested_response && (
                        <span className="font-normal text-muted-foreground">
                          → {pattern.suggested_response}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {pattern.total_occurrences} occurrence
                      {pattern.total_occurrences !== 1 ? 's' : ''} • Last seen{' '}
                      {formatDistanceToNow(new Date(pattern.last_seen), { addSuffix: true })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        pattern.confidence_score >= 90
                          ? 'default'
                          : pattern.confidence_score >= 70
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {pattern.confidence_score.toFixed(1)}% confidence
                    </Badge>
                    {pattern.auto_response_enabled ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {pattern.keywords.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {pattern.keywords.map((keyword, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`auto-${pattern.id}`}
                      checked={pattern.auto_response_enabled}
                      onCheckedChange={(checked: boolean) =>
                        handleToggleAutoResponse(pattern.id, checked)
                      }
                    />
                    <Label htmlFor={`auto-${pattern.id}`}>Auto-response</Label>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePattern(pattern.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Response Configuration</DialogTitle>
            <DialogDescription>
              Configure when patterns should automatically respond to agent requests
            </DialogDescription>
          </DialogHeader>

          {config && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled">Enable auto-response</Label>
                <Switch
                  id="enabled"
                  checked={config.enabled}
                  onCheckedChange={(checked: boolean) => handleUpdateConfig({ enabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minConfidence">Minimum confidence (%)</Label>
                <Input
                  id="minConfidence"
                  type="number"
                  min="0"
                  max="100"
                  value={config.min_confidence}
                  onChange={(e) =>
                    handleUpdateConfig({ min_confidence: parseInt(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minOccurrences">Minimum occurrences</Label>
                <Input
                  id="minOccurrences"
                  type="number"
                  min="1"
                  value={config.min_occurrences}
                  onChange={(e) =>
                    handleUpdateConfig({ min_occurrences: parseInt(e.target.value) })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="respectOverrides">Respect recent overrides</Label>
                <Switch
                  id="respectOverrides"
                  checked={config.respect_recent_overrides}
                  onCheckedChange={(checked: boolean) =>
                    handleUpdateConfig({ respect_recent_overrides: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="overrideWindow">Override window (days)</Label>
                <Input
                  id="overrideWindow"
                  type="number"
                  min="1"
                  value={config.override_window_days}
                  onChange={(e) =>
                    handleUpdateConfig({ override_window_days: parseInt(e.target.value) })
                  }
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Statistics Dialog */}
      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Response Statistics</DialogTitle>
            <DialogDescription>
              Overview of pattern learning and auto-response performance
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="grid gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_patterns}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Auto-Response Enabled</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    {stats.auto_response_enabled}
                    <Badge variant="secondary" className="text-xs">
                      {stats.total_patterns > 0
                        ? Math.round((stats.auto_response_enabled / stats.total_patterns) * 100)
                        : 0}
                      %
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.average_confidence.toFixed(1)}%</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Responses Learned</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_responses}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
