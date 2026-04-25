import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './pages/AuthPage.jsx';
import FormPage from './pages/FormPage.jsx';
import PaymentPage from './pages/PaymentPage.jsx';
import SuccessPage from './pages/SuccessPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { isUserAuthenticated } from './utils/auth.js';

function ProtectedRoute({ children }) {
  if (!isUserAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route
        path="/form"
        element={(
          <ProtectedRoute>
            <FormPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/payment"
        element={(
          <ProtectedRoute>
            <PaymentPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/success"
        element={(
          <ProtectedRoute>
            <SuccessPage />
          </ProtectedRoute>
        )}
      />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
