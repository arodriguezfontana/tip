import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import MenuPage from '@/pages/MenuPage';
import ProfilePage from '@/pages/ProfilePage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* El carrito vive fuera de las rutas para no perderlo al ir y volver del perfil. */}
        <CartProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
