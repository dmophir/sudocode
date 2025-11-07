import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Activity, Settings } from 'lucide-react'
import { agentRequestsApi } from '@/lib/api'
import { AgentRequestQueue } from '@/components/agent/AgentRequestQueue'
import { PatternsManager } from '@/components/agent/PatternsManager'
import { AgentRequestStats } from '@/components/agent/AgentRequestStats'
import type { AgentRequest } from '@/types/api'

export function OrchestrationHubPage() {
  const [pendingRequests, setPendingRequests] = useState<AgentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPendingRequests = async () => {
    try {
      setLoading(true)
      setError(null)
      const requests = await agentRequestsApi.getPending()
      setPendingRequests(requests)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPendingRequests()
    // Poll for updates every 5 seconds
    const interval = setInterval(loadPendingRequests, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Orchestration Hub</h1>
          <p className="text-muted-foreground mt-2">
            Manage concurrent agent executions and learned patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={pendingRequests.length > 0 ? 'default' : 'secondary'}>
            {pendingRequests.length} Pending
          </Badge>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">
            <Activity className="h-4 w-4 mr-2" />
            Request Queue
          </TabsTrigger>
          <TabsTrigger value="patterns">
            <Settings className="h-4 w-4 mr-2" />
            Patterns & Auto-Response
          </TabsTrigger>
          <TabsTrigger value="stats">
            <Activity className="h-4 w-4 mr-2" />
            Statistics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
              <CardDescription>
                Agent requests waiting for your response, ordered by priority
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <AgentRequestQueue
                  requests={pendingRequests}
                  onRequestRespond={loadPendingRequests}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          <PatternsManager />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <AgentRequestStats />
        </TabsContent>
      </Tabs>
    </div>
  )
}
