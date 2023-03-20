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
import { getAuth, GithubAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, doc, setDoc } from 'firebase/firestore';
import React from 'react';
import { db } from '../firebase';

type Props = {
  open: boolean;
  onClose: () => void;
};
export default function SignUpModal({ open, onClose }: Props) {
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
  const onSignUp = async (planKey: string) => {
    try {
      const provider = new GithubAuthProvider();
      provider.addScope('read:user');
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
    } catch (error) {
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
