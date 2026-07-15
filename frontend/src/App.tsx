import { Button, Card, CardContent, CardHeader, CardTitle } from '@ury/ui'
import { formatInvoiceTime } from '@ury/core'

function App() {
  return (
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
  )
}

export default App
