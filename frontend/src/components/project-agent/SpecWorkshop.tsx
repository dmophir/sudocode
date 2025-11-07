/**
 * SpecWorkshop Component
 *
 * Interactive spec review interface showing:
 * - Spec content with quality score
 * - Inline feedback from project agent
 * - Accept/reject feedback actions
 * - Re-analyze button
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Star,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface SpecWorkshopProps {
  specId: string
  /**
   * Custom class name
   */
  className?: string
}

interface SpecAnalysis {
  specId: string
  title: string
  overallScore: number
  issues: Array<{
    type: string
    severity: string
    message: string
    location?: { line?: number; section?: string }
    suggestion?: string
  }>
  suggestions: Array<{
    category: string
    title: string
    description: string
    priority: string
    actionable: boolean
  }>
  missingSections: string[]
  strengths: string[]
}

interface FeedbackItem {
  id: string
  content: string
  category?: string
  anchor?: string
  created_at: string
}

/**
 * Get color class for quality score
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

/**
 * Get status label for quality score
 */
function getScoreStatus(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Work'
  return 'Critical Issues'
}

/**
 * SpecWorkshop Component
 *
 * @example
 * ```tsx
 * <SpecWorkshop specId="spec_123" />
 * ```
 */
export function SpecWorkshop({ specId, className = '' }: SpecWorkshopProps) {
  const [spec, setSpec] = useState<any>(null)
  const [analysis, setAnalysis] = useState<SpecAnalysis | null>(null)
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const { toast } = useToast()

  // Fetch spec and analysis
  const fetchSpecData = async () => {
    setLoading(true)
    try {
      // Fetch spec details
      const specResponse = await fetch(`/api/specs/${specId}`)
      if (!specResponse.ok) throw new Error('Failed to fetch spec')
      const specData = await specResponse.json()
      setSpec(specData.data)

      // Fetch feedback for this spec
      const feedbackResponse = await fetch(`/api/feedback?spec_id=${specId}`)
      if (feedbackResponse.ok) {
        const feedbackData = await feedbackResponse.json()
        setFeedback(feedbackData.data?.feedback || [])
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load spec',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Analyze spec quality
  const analyzeSpec = async () => {
    setAnalyzing(true)
    try {
      // Call project agent to analyze spec
      // This would typically go through MCP/agent system
      // For now, call a mock endpoint
      const response = await fetch(`/api/project-agent/analyze-spec/${specId}`)
      if (!response.ok) throw new Error('Failed to analyze spec')

      const data = await response.json()
      setAnalysis(data.data)

      toast({
        title: 'Analysis Complete',
        description: `Quality score: ${data.data.overallScore}/100`,
      })
    } catch (err) {
      toast({
        title: 'Analysis Failed',
        description: err instanceof Error ? err.message : 'Failed to analyze spec',
        variant: 'destructive',
      })
    } finally {
      setAnalyzing(false)
    }
  }

  // Accept feedback item
  const acceptFeedback = async (feedbackId: string) => {
    try {
      // Mark feedback as accepted/resolved
      // This would update feedback status in backend
      toast({
        title: 'Feedback Accepted',
        description: 'Feedback marked as accepted',
      })

      // Refresh feedback list
      await fetchSpecData()
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to accept feedback',
        variant: 'destructive',
      })
    }
  }

  // Reject feedback item
  const rejectFeedback = async (feedbackId: string) => {
    try {
      // Mark feedback as rejected
      toast({
        title: 'Feedback Rejected',
        description: 'Feedback marked as rejected',
      })

      // Refresh feedback list
      await fetchSpecData()
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to reject feedback',
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    if (specId) {
      fetchSpecData()
    }
  }, [specId])

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!spec) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          <p>Spec not found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {spec.title}
              </CardTitle>
              <CardDescription className="mt-1">
                {specId}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={analyzeSpec}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Analyze Quality
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {analysis && (
          <CardContent>
            <div className="space-y-4">
              {/* Quality Score */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Quality Score</div>
                  <div className={`text-3xl font-bold ${getScoreColor(analysis.overallScore)}`}>
                    {analysis.overallScore}/100
                  </div>
                  <div className="text-sm text-muted-foreground">{getScoreStatus(analysis.overallScore)}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{analysis.strengths.length} Strengths</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span>{analysis.issues.length} Issues</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>{analysis.suggestions.length} Suggestions</span>
                  </div>
                </div>
              </div>

              {/* Issues */}
              {analysis.issues.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Issues Found</h4>
                  <div className="space-y-2">
                    {analysis.issues.map((issue, idx) => (
                      <Alert key={idx} variant={issue.severity === 'critical' ? 'destructive' : 'default'}>
                        <AlertDescription>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={issue.severity === 'critical' ? 'destructive' : 'secondary'}>
                                  {issue.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{issue.type}</span>
                              </div>
                              <p className="text-sm">{issue.message}</p>
                              {issue.suggestion && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  💡 {issue.suggestion}
                                </p>
                              )}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Suggestions</h4>
                  <div className="space-y-2">
                    {analysis.suggestions.map((suggestion, idx) => (
                      <div key={idx} className="border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{suggestion.priority}</Badge>
                          <span className="text-xs text-muted-foreground">{suggestion.category}</span>
                        </div>
                        <div className="text-sm font-medium">{suggestion.title}</div>
                        <p className="text-xs text-muted-foreground mt-1">{suggestion.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Sections */}
              {analysis.missingSections.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Missing Sections</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.missingSections.map((section, idx) => (
                      <Badge key={idx} variant="secondary">
                        {section}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Strengths</h4>
                  <div className="space-y-1">
                    {analysis.strengths.map((strength, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Feedback */}
      {feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Feedback</CardTitle>
            <CardDescription>
              Review and action feedback from the project agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {feedback.map((item) => (
                  <div key={item.id} className="border rounded-md p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {item.category && (
                          <Badge variant={
                            item.category === 'blocker' ? 'destructive' :
                            item.category === 'suggestion' ? 'default' :
                            'secondary'
                          }>
                            {item.category}
                          </Badge>
                        )}
                        {item.anchor && (
                          <span className="text-xs text-muted-foreground">
                            @ {item.anchor}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm mb-3">{item.content}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acceptFeedback(item.id)}
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectFeedback(item.id)}
                      >
                        <ThumbsDown className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Spec Content */}
      <Card>
        <CardHeader>
          <CardTitle>Spec Content</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap">{spec.content}</pre>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
