import { useDeviceBootstrap } from './hooks/useDeviceBootstrap'
import MobileQRLayout from './layouts/MobileQRLayout'
import TabletLayout from './layouts/TabletLayout'
import LandscapeKioskLayout from './layouts/LandscapeKioskLayout'
import PortraitKioskLayout from './layouts/PortraitKioskLayout'
import type { OrderingLayout } from './lib/api'

const LAYOUTS: Record<OrderingLayout, typeof MobileQRLayout> = {
  Mobile: MobileQRLayout,
  Tablet: TabletLayout,
  'Landscape Kiosk': LandscapeKioskLayout,
  'Portrait Kiosk': PortraitKioskLayout,
}

/**
 * Layout-shell selector. A provisioned device (kiosk/tablet, resolved via
 * useDeviceBootstrap from a stored device credential) picks its layout from
 * the server-returned `deviceContext.layout` — never a client guess — and
 * skips straight to it with an already-resolved context, so it never
 * re-bootstraps via QR token. Anything else (no stored device credential —
 * the QR/mobile case) falls through to MobileQRLayout, which does its own
 * token/session bootstrap via useOrderingSession().
 */
function App() {
  const { isDevice, deviceContext, deviceLoading, deviceError } = useDeviceBootstrap()

  if (isDevice) {
    if (deviceLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Starting up…
        </div>
      )
    }
    if (deviceError || !deviceContext) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6 text-center text-destructive">
          {deviceError ?? 'This device could not be started. Please contact staff.'}
        </div>
      )
    }
    const Layout = LAYOUTS[deviceContext.layout] ?? MobileQRLayout
    return <Layout initialContext={deviceContext} />
  }

  return <MobileQRLayout />
}

export default App
