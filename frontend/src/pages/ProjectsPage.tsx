import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useOpenProject, useDeleteProject, useInitProject } from '@/hooks/useProjects'
import { useProject } from '@/hooks/useProject'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FolderOpen, Trash2, Plus, Check, Loader2 } from 'lucide-react'
import type { ProjectInfo } from '@/types/project'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { data: projects, isLoading, isError } = useProjects()
  const { currentProjectId, setCurrentProjectId } = useProject()
  const openProject = useOpenProject()
  const deleteProject = useDeleteProject()
  const initProject = useInitProject()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectInfo | null>(null)
  const [initDialogOpen, setInitDialogOpen] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [isValidating, setIsValidating] = useState(false)

  const handleOpenProject = async (project: ProjectInfo) => {
    try {
      await openProject.mutateAsync({ path: project.path })
      setCurrentProjectId(project.id)
      navigate('/issues')
    } catch (error) {
      console.error('Failed to open project:', error)
    }
  }

  const handleDeleteClick = (project: ProjectInfo) => {
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return

    try {
      await deleteProject.mutateAsync(projectToDelete.id)
      // If deleting the current project, clear it
      if (projectToDelete.id === currentProjectId) {
        setCurrentProjectId(null)
      }
      setDeleteDialogOpen(false)
      setProjectToDelete(null)
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  const handleInitProject = async () => {
    if (!projectPath.trim()) return

    setIsValidating(true)
    try {
      const project = await initProject.mutateAsync({
        path: projectPath.trim(),
        name: projectName.trim() || undefined,
      })
      setCurrentProjectId(project.id)
      setInitDialogOpen(false)
      setProjectPath('')
      setProjectName('')
      navigate('/issues')
    } catch (error) {
      console.error('Failed to initialize project:', error)
    } finally {
      setIsValidating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive">Failed to load projects</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please check your connection and try again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your Sudocode projects
          </p>
        </div>
        <Button onClick={() => setInitDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started by initializing a new project
          </p>
          <Button onClick={() => setInitDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Initialize Project
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-accent/50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.id === currentProjectId && (
                    <Badge variant="default" className="text-xs">
                      Current
                    </Badge>
                  )}
                  {project.favorite && (
                    <span className="text-yellow-500">★</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{project.path}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last opened: {new Date(project.lastOpenedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {project.id !== currentProjectId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenProject(project)}
                    disabled={openProject.isPending}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Open
                  </Button>
                )}
                {project.id === currentProjectId && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4" />
                    Active
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(project)}
                  disabled={deleteProject.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unregister "{projectToDelete?.name}"? This will remove it
              from your project list but will not delete the project files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Initialize Project Dialog */}
      <Dialog open={initDialogOpen} onOpenChange={setInitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initialize New Project</DialogTitle>
            <DialogDescription>
              Enter the path to a directory to initialize as a Sudocode project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Project Path</label>
              <Input
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Project Name (optional)</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInitProject}
              disabled={!projectPath.trim() || isValidating || initProject.isPending}
            >
              {isValidating || initProject.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Initializing...
                </>
              ) : (
                'Initialize'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

