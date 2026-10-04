import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/app/style.css';
import { Popup } from '@/app/Popup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
