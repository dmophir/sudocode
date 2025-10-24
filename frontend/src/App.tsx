import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/issues" replace />} />
        <Route
          path="/issues"
          element={
            <div className="flex h-screen items-center justify-center bg-background text-foreground">
              <div className="text-center">
                <h1 className="text-4xl font-bold">Sudocode UI</h1>
                <p className="mt-4 text-muted-foreground">
                  Frontend workspace is ready! 🚀
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Next: Implement routing and layout components (ISSUE-019, ISSUE-020)
                </p>
              </div>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
