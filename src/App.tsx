import React from 'react';
import './App.css';
import { ConfigProvider } from 'antd';
import { Outlet } from 'react-router';

function App() {
  return (
    <div className="App">
      <ConfigProvider
        theme={{
          token: {
            fontSize: 16,
            colorPrimary: '#ab74e6',
          },
        }}
      >
        <Outlet />
      </ConfigProvider>
    </div>
  );
}

export default App;
