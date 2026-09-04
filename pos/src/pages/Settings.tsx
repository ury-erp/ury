import { Card, CardContent } from '@ury/ui';

export default function Settings() {
  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50 flex items-center justify-center">
      <Card className="bg-white border border-gray-200 max-w-md w-full">
        <CardContent className="p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600 text-sm">Settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
