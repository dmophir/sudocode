import { useChatWidget } from '@/contexts/ChatWidgetContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChatWidgetFAB } from './ChatWidgetFAB'
import { ChatWidgetOverlay } from './ChatWidgetOverlay'
import { ChatWidgetPanel } from './ChatWidgetPanel'
import { ChatWidgetContent } from './ChatWidgetContent'

/**
 * ChatWidget - Main orchestrator component
 *
 * Renders the FAB and either the floating overlay or slide-in panel
 * based on the current mode. Uses context for state management.
 */
export function ChatWidget() {
  const {
    isOpen,
    mode,
    selectedExecutionId,
    selectedExecution,
    autoConnectLatest,
    isExecutionRunning,
    hasUnseenExecution,
    toggle,
    close,
    setMode,
    selectExecution,
    setAutoConnectLatest,
    setCreatedExecution,
  } = useChatWidget()

  const handleModeToggle = () => {
    setMode(mode === 'floating' ? 'panel' : 'floating')
  }

  const contentProps = {
    executionId: selectedExecutionId,
    execution: selectedExecution,
    autoConnectLatest,
    mode,
    onClose: close,
    onModeToggle: handleModeToggle,
    onExecutionSelect: selectExecution,
    onAutoConnectChange: setAutoConnectLatest,
    onCreatedExecution: setCreatedExecution,
  }

  // Hide FAB when floating overlay is open (overlay replaces FAB position)
  const showFab = !isOpen || mode === 'panel'

  return (
    <TooltipProvider>
      {/* Floating Action Button - hidden when floating overlay is open */}
      {showFab && (
        <ChatWidgetFAB
          onClick={toggle}
          isOpen={isOpen}
          isRunning={isExecutionRunning && !isOpen}
          hasNotification={hasUnseenExecution && !isOpen}
        />
      )}

      {/* Widget container - either floating overlay or slide-in panel */}
      {isOpen && (
        <>
          {mode === 'floating' ? (
            <ChatWidgetOverlay>
              <ChatWidgetContent {...contentProps} />
            </ChatWidgetOverlay>
          ) : (
            <ChatWidgetPanel onClose={close}>
              <ChatWidgetContent {...contentProps} />
            </ChatWidgetPanel>
          )}
        </>
      )}
    </TooltipProvider>
  )
}
