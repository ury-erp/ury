import MobileQRLayout from './layouts/MobileQRLayout'

// TODO: select layout by device type (tablet / landscape kiosk / portrait
// kiosk / mobile) once those layouts exist — for now always render mobile.
function App() {
  return <MobileQRLayout />
}

export default App
