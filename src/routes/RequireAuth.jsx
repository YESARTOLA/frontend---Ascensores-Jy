import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}
