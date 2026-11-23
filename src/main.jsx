import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthPage from './components/AuthPage.jsx';
import BuildLibrary from './components/BuildLibrary.jsx';
import './index.css';

const route = window.location.pathname.replace(/\/$/, '');
let page = <App />;
if (route === '/login' || route === '/signup') page = <AuthPage signup={route === '/signup'} />;
if (route === '/builds' || route === '/admin') page = <BuildLibrary admin={route === '/admin'} />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>
);
