import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { refreshSession } from './api/http.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

// Try to restore the session from the httpOnly refresh cookie. This gives us the
// user profile but NOT the master key – the user unlocks with their password.
const boot = window.location.pathname.startsWith('/s/') ? Promise.resolve() : refreshSession().catch(() => {});

boot.finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter><App /></BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
