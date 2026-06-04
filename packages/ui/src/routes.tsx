import { createMemoryRouter, Navigate } from 'react-router-dom';
import App from './App';
import { Login } from '@/components/Login';
import { DebugPage } from '@/components/DebugPage';
import { Presets } from '@/components/Presets';
import { Dashboard } from '@/components/Dashboard';
import { CacheManager } from '@/components/CacheManager';
import { BudgetTracker } from '@/components/BudgetTracker';
import { Pipeline } from '@/components/Pipeline';
import { ProviderMonitor } from '@/components/ProviderMonitor';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicRoute from '@/components/PublicRoute';

export const router = createMemoryRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: <PublicRoute><Login /></PublicRoute>,
  },
  {
    path: '/dashboard',
    element: <ProtectedRoute><App /></ProtectedRoute>,
  },
  {
    path: '/presets',
    element: <ProtectedRoute><Presets /></ProtectedRoute>,
  },
  {
    path: '/debug',
    element: <ProtectedRoute><DebugPage /></ProtectedRoute>,
  },
  {
    path: '/monitoring',
    element: <ProtectedRoute><Dashboard /></ProtectedRoute>,
  },
  {
    path: '/cache',
    element: <ProtectedRoute><CacheManager /></ProtectedRoute>,
  },
  {
    path: '/budget',
    element: <ProtectedRoute><BudgetTracker /></ProtectedRoute>,
  },
  {
    path: '/pipeline',
    element: <ProtectedRoute><Pipeline /></ProtectedRoute>,
  },
  {
    path: '/providers-monitor',
    element: <ProtectedRoute><ProviderMonitor /></ProtectedRoute>,
  },
], {
  initialEntries: ['/dashboard']
});