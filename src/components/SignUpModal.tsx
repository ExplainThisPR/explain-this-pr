// Create a Modal using antd that explains the pricing plan and how you can sign up
import {
  Button,
  Col,
  Input,
  Row,
  Typography,
  Modal,
  message,
  Divider,
} from 'antd';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getAuth, GithubAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React from 'react';
import { useNavigate } from 'react-router';
import { db } from '../firebase';

const stripeCheckoutUrls: Record<string, string> = {
  free: '',
  starter: 'https://buy.stripe.com/test_6oEeXG9u9erqePK6oo',
  pro: 'https://buy.stripe.com/test_6oE16Q49P1EE6je001',
};

type Props = {
  open: boolean;
  onClose: () => void;
};
export default function SignUpModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const pricingTiers = [
    {
      key: 'free',
      name: 'Free',
      price: 0,
      features: ['1 repo', 'Trigger on comment', '~ 25K lines of code/month'], // cost: $0.02
    },
    {
      key: 'starter',
      name: 'Starter Pack',
      price: 999,
      features: ['4 repos', 'Advanced workfow', '~ 100K LOC/month'], // cost: $0.08
      trialLength: 14,
    },
    {
      key: 'pro',
      name: 'Pro Pack',
      price: 3499,
      features: ['30 repos', 'Advanced workflow', '~ 800K LOC/month'], // cost: $6.4
      trialLength: 14,
    },
  ];
  const subscribe = (planKey: string, userEmail: string) => {
    const url = stripeCheckoutUrls[planKey];
    if (url) {
      window.location.href = `${url}?prefilled_email=${userEmail}`;
    } else {
      navigate('/signup-success');
    }
  };
  const trackSignupStart = (planKey: string) => {
    const analytics = getAnalytics();
    logEvent(analytics, 'attempt_signup', {
      planKey,
      method: 'github',
    });
  };
  const trackSignupSuccess = (planKey: string) => {
    const analytics = getAnalytics();
    logEvent(analytics, 'signup_success', {
      planKey,
      method: 'github',
    });
  };
  const onSignUp = async (planKey: string) => {
    try {
      trackSignupStart(planKey);
      const provider = new GithubAuthProvider();
      provider.addScope('read:user');
      provider.addScope('user:email');
      const auth = getAuth();
      const data = await signInWithPopup(auth, provider);
      // Create a user document in the User collection
      const ref = doc(db, 'Users', data.user.uid);
      const userDoc = await setDoc(ref, {
        id: '/Users/' + data.user.uid,
        uid: data.user.uid,
        email: data.user.email,
        name: data.user.displayName,
        photoURL: data.user.photoURL,
        githubId: data.user.providerData[0].uid,
        plan: planKey,
        usage: {
          repos: 0,
          loc: 0,
          repos_limit: 1,
          loc_limit: 25000,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      localStorage.setItem('user', JSON.stringify(userDoc));
      trackSignupSuccess(planKey);
      subscribe(planKey, data.user.email || '');
    } catch (error) {
      message.warning('Something went wrong signing up! Please try again.');
      console.error(error);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={800}>
      <Row gutter={8}>
        {pricingTiers.map((tier, i) => (
          <Col span={8}>
            <div className="pricing-tier">
              <Typography.Title level={4}>{tier.name}</Typography.Title>
              <Typography.Title level={2}>
                ${(tier.price / 100).toFixed(2)}
                {tier.price > 0 ? '/mo' : ''}
              </Typography.Title>
              <Divider />
              <ul>
                {tier.features.map((feature) => (
                  <li>{feature}</li>
                ))}
              </ul>
              <Button
                type={i > 0 ? 'primary' : 'dashed'}
                style={{ width: '100%' }}
                onClick={() => onSignUp(tier.key)}
              >
                {tier.trialLength
                  ? `Start Trial (${tier.trialLength} days)`
                  : 'Get Started'}
              </Button>
            </div>
          </Col>
        ))}
      </Row>
    </Modal>
  );
}
