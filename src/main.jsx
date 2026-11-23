import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthPage from './components/AuthPage.jsx';
import './index.css';

const route = window.location.pathname.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {route === '/login' || route === '/signup'
      ? <AuthPage signup={route === '/signup'} />
      : <App />}
  </React.StrictMode>
);
