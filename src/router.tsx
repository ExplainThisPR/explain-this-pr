import moment from 'moment';
import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import { auth } from './firebase';
import ErrorPage from './pages/ErrorPage/ErrorPage';
import LandingPage from './pages/LandingPage/LandingPage';
import Success from './pages/Success/Success';

type Props = {
  children: React.ReactElement;
};
const RestrictAuth = ({ children }: Props) => {
  const location = useLocation();
  const account = JSON.parse(localStorage.getItem('account') || 'null');
  const signUserOut = React.useCallback(() => {
    auth.signOut();
    localStorage.removeItem('account');
  }, []);
  if (
    !account ||
    moment().subtract(3, 'hours').isAfter(moment(account.login_at))
  ) {
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
        path: '/signup-success',
        element: (
          <RestrictGuest>
            <Success />
          </RestrictGuest>
        ),
      },
      /*
      {
        path: '/code-verify',
        element: (
          <RestrictGuest>
            <CodeVerify />
          </RestrictGuest>
        ),
      },
      {
        path: '/home',
        element: (
          <RestrictAuth>
            <Home />
          </RestrictAuth>
        ),
      },*/
    ],
  },
]);

export default router;
