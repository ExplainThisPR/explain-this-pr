import React from 'react';
import './App.css';
import { ConfigProvider } from 'antd';
import { Outlet, useLocation } from 'react-router';

function App() {
  const fontFamily =
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue,Noto Sans, Liberation Sans, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji';
  const { pathname } = useLocation();

  React.useEffect(() => {
    const body = document.querySelector('#root');
    body?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [pathname]);

  return (
    <div className="App">
      <ConfigProvider
        theme={{
          token: {
            fontSize: 16,
            colorPrimary: '#ab74e6',
            fontFamily,
          },
        }}
      >
        <Outlet />
      </ConfigProvider>
    </div>
  );
}

export default App;
