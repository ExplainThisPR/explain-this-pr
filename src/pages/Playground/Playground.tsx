import { Button, Col, Input, Row, Typography, message, Divider } from 'antd';
import axios from 'axios';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';
import { Helmet } from 'react-helmet';
import { doc, onSnapshot } from 'firebase/firestore';
import './Playground.css';
import { db } from '../../firebase';
import SignUpModal from '../../components/SignUpModal';
import { getAnalytics, logEvent } from 'firebase/analytics';

type PublicData = {
  last_run_at: string;
  loc_analyzed: number;
  runs: number;
};
function Playground() {
  const [diff, setDiff] = React.useState('');
  const [result, setResult] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [stats, setStats] = React.useState<PublicData | null>(null);
  const [showSignupModal, setShowSignupModal] = React.useState(false);
  // Call the Firebase Function with diff_body as the body
  const handleExplain = async () => {
    try {
      setLoading(true);
      const URL =
        'https://us-central1-explain-this-pr.cloudfunctions.net/githubWebhook';
      const { data } = await axios.post(URL, {
        diff_body: diff,
      });
      console.log(data);
      setResult(data.comment);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.error(error);
      message.error('Your request failed. Please try again');
    }
  };
  const openSignupButton = () => {
    setShowSignupModal(true);
    const analytics = getAnalytics();
    logEvent(analytics, 'get_extension_click', {
      method: 'landing_page',
    });
  };

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
  const command = [
    'gh api \\',
    '-H "Accept: application/vnd.github+json" \\',
    '-H "X-GitHub-Api-Version: 2022-11-28" \\',
    '/repos/[OWNER]/[REPO]/pulls/[PULL]/files \\',
    '> output.json',
  ].join('\n');

  return (
    <div className="page-container">
      <Helmet>
        <title>ExplainThisPR - Playground</title>
      </Helmet>
      <header>
        <Col sm={20} md={12} lg={4} style={{ textAlign: 'center' }}>
          <Button size="large" type="primary" onClick={openSignupButton}>
            Get GitHub Integration
          </Button>
        </Col>
      </header>
      <Typography.Title>ExplainThisPR</Typography.Title>
      <Typography.Title level={4}>
        1. Use the{' '}
        <a
          href="https://github.com/cli/cli#installation"
          target="_blank"
          rel="noreferrer"
        >
          Github CLI
        </a>{' '}
        to run this command
      </Typography.Title>
      <Row justify="center">
        <Col sm={24} md={12} lg={8} className="sh-code">
          <Typography.Text copyable className="sh-code-text">
            {command}
          </Typography.Text>
        </Col>
      </Row>
      <br />
      <Typography.Title level={4}>
        2. Copy the contents of the output.json file and paste it below
      </Typography.Title>
      <br />
      <Row justify="center">
        <Col sm={20} md={18}>
          <Input.TextArea
            className="textarea font-mono"
            placeholder="Paste the response from the pulls/{id}/files API call here"
            autoSize={{ minRows: 10, maxRows: 20 }}
            onChange={(e) => setDiff(e.target.value)}
            value={diff}
          />
        </Col>
      </Row>
      <br />
      <Row justify="center">
        <Col sm={12} md={8} lg={5}>
          <Button
            size="large"
            onClick={handleExplain}
            loading={loading}
            style={{ width: '100%' }}
          >
            Get to work
          </Button>
        </Col>
      </Row>
      <Divider />
      {result ? (
        <ReactMarkdown
          className="markdown-container font-mono"
          remarkPlugins={[remarkGfm, remarkGemoji]}
          children={result}
        />
      ) : (
        <div className="markdown-container font-mono">
          <Typography.Text className="font-mono">
            Well, what are you waiting for?
          </Typography.Text>
        </div>
      )}
      <br />
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
      <SignUpModal
        open={showSignupModal}
        onClose={() => setShowSignupModal(false)}
      />
    </div>
  );
}

export default Playground;
