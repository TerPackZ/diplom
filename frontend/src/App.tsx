import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import GroupPage from './pages/GroupPage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import UserProfilePage from './pages/UserProfilePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    );
  }
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <>
      {user && <Navbar />}

      <Routes>
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />

        <Route
          path="/login"
          element={<PublicRoute><LoginPage /></PublicRoute>}
        />
        <Route
          path="/register"
          element={<PublicRoute><RegisterPage /></PublicRoute>}
        />

        <Route
          path="/dashboard"
          element={<PrivateRoute><DashboardPage /></PrivateRoute>}
        />
        <Route
          path="/groups/:id"
          element={<PrivateRoute><GroupPage /></PrivateRoute>}
        />
        <Route
          path="/profile"
          element={<PrivateRoute><ProfilePage /></PrivateRoute>}
        />
        <Route
          path="/friends"
          element={<PrivateRoute><FriendsPage /></PrivateRoute>}
        />
        <Route
          path="/users/:id"
          element={<PrivateRoute><UserProfilePage /></PrivateRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
