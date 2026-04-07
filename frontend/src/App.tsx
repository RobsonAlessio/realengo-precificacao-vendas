import { Navigate, Route, Routes } from "react-router-dom"
import { useAuthStore } from "./store/authStore"
import LoginPage from "./pages/login/LoginPage"
import AppLayout from "./layouts/AppLayout"
import PricesPage from "./pages/prices/PricesPage"
import SimulatorPage from "./pages/simulator/SimulatorPage"
import ParamsPage from "./pages/params/ParamsPage"
import AdminPage from "./pages/admin/AdminPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="prices" replace />} />
        <Route path="prices" element={<PricesPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
        <Route path="params" element={<ParamsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/prices" replace />} />
    </Routes>
  )
}
