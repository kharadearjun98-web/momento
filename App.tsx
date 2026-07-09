import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { NotificationProvider } from './lib/useNotification';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Notebook } from './pages/Notebook';
import { Notebooks } from './pages/Notebooks';
import { StyleGuide } from './pages/StyleGuide';
import { NewNotebookSetup } from './pages/NewNotebookSetup';
import { Discover } from './pages/Discover';
import { ChoosePlan } from './pages/ChoosePlan';
import { AccountPage } from './pages/AccountPage';
import { SignIn } from './components/auth/SignIn';
import { SignUp } from './components/auth/SignUp';
import { ResetPassword } from './components/auth/ResetPassword';
import { AuthCallback } from './components/auth/AuthCallback';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import './index.css';

console.log('App component loaded');

function App() {
  console.log('App rendering...');
  return (
    <NotificationProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0B0E13',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            backdropFilter: 'blur(12px)',
          },
          success: {
            iconTheme: {
              primary: '#22D3EE',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <Router>
        <Routes>
          {/* Auth Routes - No Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/choose-plan" element={<ProtectedRoute><ChoosePlan /></ProtectedRoute>} />
          
          {/* Protected Routes - With Layout */}
          <Route path="/" element={<Layout><ProtectedRoute><Dashboard /></ProtectedRoute></Layout>} />
          <Route path="/notebooks" element={<Layout><ProtectedRoute><Notebooks /></ProtectedRoute></Layout>} />
          <Route path="/new" element={<Layout><ProtectedRoute><NewNotebookSetup /></ProtectedRoute></Layout>} />
          <Route path="/discover" element={<Layout><ProtectedRoute><Discover /></ProtectedRoute></Layout>} />
          <Route path="/profile" element={<Layout><ProtectedRoute><AccountPage view="profile" /></ProtectedRoute></Layout>} />
          <Route path="/settings" element={<Layout><ProtectedRoute><AccountPage view="settings" /></ProtectedRoute></Layout>} />
          <Route path="/notebook/:id" element={<Layout><ProtectedRoute><Notebook /></ProtectedRoute></Layout>} />
          <Route path="/style-guide" element={<Layout><ProtectedRoute><StyleGuide /></ProtectedRoute></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </NotificationProvider>
  );
}

export default App;
