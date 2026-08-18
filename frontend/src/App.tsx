import { Route, Routes } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ury/ui';
import { formatInvoiceTime } from '@ury/core';
import { AuthGuard } from './components/AuthGuard';
import { ReportsLayout } from './pages/Reports/ReportsLayout';
import { ReportsHome } from './pages/Reports/ReportsHome';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>URY Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Current time: {formatInvoiceTime(new Date().toISOString())}
                </p>
                <Button>Get Started</Button>
              </CardContent>
            </Card>
          </div>
        }
      />
      <Route
        path="/reports/*"
        element={
          <AuthGuard>
            <ReportsLayout />
          </AuthGuard>
        }
      >
        <Route index element={<ReportsHome />} />
      </Route>
    </Routes>
  );
}

export default App;
