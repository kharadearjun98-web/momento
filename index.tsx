import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
  });
}

console.log('🚀 Starting Memento application...');
console.log('🔍 Environment check:');
console.log('  - VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL ? 'SET' : 'MISSING');
console.log('  - VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #0B0E13; color: white; font-family: Inter, sans-serif;">
      <div style="text-align: center;">
        <h1 style="font-size: 2rem; margin-bottom: 1rem;">⚠️ Error</h1>
        <p>Could not find root element to mount application.</p>
      </div>
    </div>
  `;
  throw new Error("Could not find root element to mount to");
}

console.log('✅ Root element found');

// Lazy load App to catch import errors
import('./App').then((module) => {
  const App = module.default;
  console.log('✅ App component loaded');
  
  try {
    const root = ReactDOM.createRoot(rootElement);
    console.log('✅ React root created');
    
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('✅ App rendered successfully!');
  } catch (error) {
    Sentry.captureException(error);
    console.error('❌ Render error:', error);
    rootElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #0B0E13; color: white; font-family: Inter, sans-serif;">
        <div style="text-align: center; max-width: 600px; padding: 2rem;">
          <h1 style="font-size: 2rem; margin-bottom: 1rem; color: #EF4444;">⚠️ Render Error</h1>
          <p style="margin-bottom: 1rem;">Failed to render the application.</p>
          <pre style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; text-align: left; overflow-x: auto; font-size: 0.875rem;">${error instanceof Error ? error.stack : String(error)}</pre>
          <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #8B5CF6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">Reload</button>
        </div>
      </div>
    `;
  }
}).catch((error) => {
  Sentry.captureException(error);
  console.error('❌ Import error:', error);
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #0B0E13; color: white; font-family: Inter, sans-serif;">
      <div style="text-align: center; max-width: 600px; padding: 2rem;">
        <h1 style="font-size: 2rem; margin-bottom: 1rem; color: #EF4444;">⚠️ Import Error</h1>
        <p style="margin-bottom: 1rem;">Failed to load the application. Check console for details.</p>
        <pre style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; text-align: left; overflow-x: auto; font-size: 0.875rem;">${error instanceof Error ? error.stack : String(error)}</pre>
        <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #8B5CF6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">Reload</button>
      </div>
    </div>
  `;
});
