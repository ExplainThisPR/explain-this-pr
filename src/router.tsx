import moment from 'moment';
import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import { auth } from './firebase';
import ErrorPage from './pages/ErrorPage/ErrorPage';
import LandingPage from './pages/LandingPage/LandingPage';
import Playground from './pages/Playground/Playground';
import Success from './pages/Success/Success';

type Props = {
  children: React.ReactElement;
};
const RestrictAuth = ({ children }: Props) => {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const signUserOut = React.useCallback(() => {
    auth.signOut();
    localStorage.removeItem('user');
  }, []);
  if (!user || moment().subtract(10, 'days').isAfter(moment(user.login_at))) {
    // User is not logged in or session has expired
    signUserOut();
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const RestrictGuest = ({ children }: Props) => {
  const account = JSON.parse(localStorage.getItem('account') || 'null');
  if (account) {
    // User is already logged in
    return <Navigate to="/home" replace />;
  }

  return children;
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    //loader: rootLoader,
    children: [
      {
        path: '/',
        element: <LandingPage />,
      },
      {
        path: '/playground',
        element: <Playground />,
      },
      {
        path: '/signup-success',
        element: <Success />,
      },
      {
        path: '/this-should-not-happen',
        element: (
          <RestrictGuest>
            <Success />
          </RestrictGuest>
        ),
      } /*
      {
        path: '/home',
        element: (
          <RestrictAuth>
            <Home />
          </RestrictAuth>
        ),
      },*/,
    ],
  },
]);

export default router;
