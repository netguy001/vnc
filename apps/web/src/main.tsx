import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LiveProvider } from './context/LiveContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <LiveProvider>
            <ErrorBoundary label="the console">
              <App />
            </ErrorBoundary>
          </LiveProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
