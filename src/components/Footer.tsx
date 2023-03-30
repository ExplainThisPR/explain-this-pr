// Render a apge that says hello world
import { Col, Typography } from 'antd';
import { doc, onSnapshot } from 'firebase/firestore';
import React from 'react';
import { db } from '../firebase';
import { PublicData } from '../types/PublicData';

type Props = {};
export default function Footer(props: Props) {
  const [stats, setStats] = React.useState<PublicData | null>(null);
  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'AdminDashboard', 'public'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as PublicData;
        setStats(data);
      }
    });
    return () => {
      unsub();
    };
  }, []);
  const analyzedCode = React.useMemo(() => {
    const value = stats?.loc_analyzed || 1000;
    return value.toLocaleString();
  }, [stats?.loc_analyzed]);

  return (
    <div>
      <Typography.Title level={3}>
        We have already processed over {analyzedCode} lines of code and
        counting!
      </Typography.Title>
      <br />
      <Col span={24}>
        <a
          href="https://github.com/frenchmajesty"
          target="_blank"
          rel="noreferrer"
        >
          <img
            className="social-icon"
            src="./icons/github.svg"
            alt="Github logo"
          />
        </a>
        <a
          href="https://twitter.com/frenchmajesty"
          target="_blank"
          rel="noreferrer"
        >
          <img
            className="social-icon"
            src="./icons/twitter.svg"
            alt="Twitter logo"
          />
        </a>
      </Col>
    </div>
  );
}
