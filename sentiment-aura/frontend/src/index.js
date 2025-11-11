import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

if (process.env.NODE_ENV === 'development') {
  console.log('React app starting...');
}
const rootElement = document.getElementById('root');
if (!rootElement) {
  if (process.env.NODE_ENV === 'development') {
    console.error('Root element not found!');
  }
} else {
  if (process.env.NODE_ENV === 'development') {
    console.log('Root element found, creating React root...');
  }
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  if (process.env.NODE_ENV === 'development') {
    console.log('React app rendered');
  }
}

