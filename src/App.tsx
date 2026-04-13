import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import MainLayout from '@/components/Layout/MainLayout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import ProjectListPage from '@/pages/ProjectListPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import ProjectSettingsPage from '@/pages/ProjectSettingsPage'
import SystemSettingsPage from '@/pages/SystemSettingsPage'
import AuditLogPage from '@/pages/AuditLogPage'

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#6366f1',
        borderRadius: 6,
      },
    }}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProjectListPage />} />
              <Route path="project/:projectId" element={<ProjectDetailPage />} />
              <Route path="project/:projectId/settings" element={<ProjectSettingsPage />} />
              <Route path="settings" element={<SystemSettingsPage />} />
              <Route path="audit-logs" element={<AuditLogPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}
