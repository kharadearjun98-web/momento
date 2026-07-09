import React from 'react';
import ReactDOM from 'react-dom/client';

console.log('🚀 TEST: Script loaded');
console.log('🚀 TEST: React:', typeof React);
console.log('🚀 TEST: ReactDOM:', typeof ReactDOM);

const rootElement = document.getElementById('root');
console.log('🚀 TEST: Root element:', rootElement);

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    console.log('🚀 TEST: Root created successfully');
    
    root.render(
      <div style={{ 
        background: '#0B0E13', 
        color: 'white', 
        padding: '50px',
        fontSize: '24px',
        minHeight: '100vh'
      }}>
        <h1>✅ React is working!</h1>
        <p>If you see this, React is rendering correctly.</p>
        <p>Time: {new Date().toLocaleTimeString()}</p>
      </div>
    );
    console.log('🚀 TEST: Render called');
  } catch (error) {
    console.error('❌ TEST: Error:', error);
    document.body.innerHTML = `<div style="color: red; padding: 20px;"><h1>Error:</h1><pre>${error}</pre></div>`;
  }
}
