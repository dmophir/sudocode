import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Clock, AlertCircle, CheckCircle, Zap } from 'lucide-react'
import { agentRequestsApi } from '@/lib/api'
import type { AgentRequest } from '@/types/api'
import { formatDistanceToNow } from 'date-fns'

interface AgentRequestQueueProps {
  requests: AgentRequest[]
  onRequestRespond?: () => void
}

export function AgentRequestQueue({ requests, onRequestRespond }: AgentRequestQueueProps) {
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [responseValue, setResponseValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleRespond = async (requestId: string) => {
    if (!responseValue.trim()) return

    try {
      setError(null)
      await agentRequestsApi.respond(requestId, { value: responseValue })
      setRespondingTo(null)
      setResponseValue('')
      onRequestRespond?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond')
    }
  }

  const handleCancel = async (requestId: string) => {
    try {
      setError(null)
      await agentRequestsApi.cancel(requestId)
      onRequestRespond?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request')
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'destructive'
      case 'high':
        return 'default'
      case 'medium':
        return 'secondary'
      case 'low':
        return 'outline'
      default:
        return 'secondary'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'confirmation':
        return <CheckCircle className="h-4 w-4" />
      case 'choice':
        return <AlertCircle className="h-4 w-4" />
      case 'guidance':
        return <Zap className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No pending requests</p>
        <p className="text-sm mt-2">All agent requests have been handled</p>
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

      {requests.map((request) => (
        <Card key={request.id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {getTypeIcon(request.type)}
                <div>
                  <CardTitle className="text-base">{request.message}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                {request.issue_priority && (
                  <Badge variant={getPriorityColor(request.issue_priority)}>
                    {request.issue_priority}
                  </Badge>
                )}
                {request.urgency === 'blocking' && (
                  <Badge variant="destructive">Blocking</Badge>
                )}
                {request.response_auto && (
                  <Badge variant="secondary">Auto-responded</Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {request.context && (
              <div className="text-sm text-muted-foreground">
                <strong>Context:</strong> {JSON.stringify(request.context)}
              </div>
            )}

            {request.keywords && request.keywords.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {request.keywords.map((keyword, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            )}

            {respondingTo === request.id ? (
              <div className="space-y-3 pt-3 border-t">
                <div className="space-y-2">
                  <Label htmlFor={`response-${request.id}`}>Your Response</Label>
                  {request.options && request.options.length > 0 ? (
                    <Select value={responseValue} onValueChange={setResponseValue}>
                      <SelectTrigger id={`response-${request.id}`}>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {request.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`response-${request.id}`}
                      value={responseValue}
                      onChange={(e) => setResponseValue(e.target.value)}
                      placeholder="Enter your response..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRespond(request.id)
                        }
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleRespond(request.id)} size="sm">
                    Submit
                  </Button>
                  <Button
                    onClick={() => {
                      setRespondingTo(null)
                      setResponseValue('')
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-3 border-t">
                <Button
                  onClick={() => setRespondingTo(request.id)}
                  size="sm"
                  variant="default"
                >
                  Respond
                </Button>
                <Button
                  onClick={() => handleCancel(request.id)}
                  size="sm"
                  variant="outline"
                >
                  Cancel Request
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
