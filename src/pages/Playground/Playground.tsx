import { Button, Col, Input, Row, Typography, message, Divider } from 'antd';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';
import { Helmet } from 'react-helmet';
import './Playground.css';
import SignUpModal from '../../components/SignUpModal';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FilterFilled } from '@ant-design/icons';
import Footer from '../../components/Footer';
import { Link } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';

const { REACT_APP_PLAYGROUND_API: PLAYGROUND_API, REACT_APP_NAME: APP_NAME } =
  process.env;

const functions = getFunctions();
const analyzePlaygroundDiff = httpsCallable<
  { diff_body: string },
  { comment: string }
>(functions, PLAYGROUND_API!);

function Playground() {
  const analytics = getAnalytics();
  const [diff, setDiff] = React.useState('');
  const [result, setResult] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showSignupModal, setShowSignupModal] = React.useState(false);
  // Call the Firebase Function with diff_body as the body
  const handleExplain = async () => {
    try {
      logEvent(analytics, 'submit_explain_form');
      setLoading(true);
      const { data } = await analyzePlaygroundDiff({ diff_body: diff });
      console.log(data);
      setResult(data.comment);
      setLoading(false);
      if (!data.comment) {
        message.error('Sorry, your request failed. Please try again');
      }
    } catch (error) {
      setLoading(false);
      console.error('Failed to make request to explain this diff', error);
      message.error('Sorry, your request failed. Please try again');
    }
  };
  const openSignupButton = () => {
    setShowSignupModal(true);
    logEvent(analytics, 'get_extension_click', {
      method: 'landing_page',
    });
  };
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
        <title>Playground - {APP_NAME}</title>
      </Helmet>
      <header>
        <Row justify="space-between">
          <Link to="/">
            <Button size="large">Go Home</Button>
          </Link>
          <Col sm={20} md={12} lg={4} style={{ textAlign: 'center' }}>
            <Button size="large" type="primary" onClick={openSignupButton}>
              Sign Up With Github
            </Button>
          </Col>
        </Row>
      </header>
      <Typography.Title>{APP_NAME}</Typography.Title>
      <Typography.Title level={4}>
        1. Use the{' '}
        <a
          href="https://github.com/cli/cli#installation"
          target="_blank"
          rel="noreferrer"
          onClick={() => logEvent(analytics, 'github_cli_url_click')}
        >
          Github CLI
        </a>{' '}
        to run this command
      </Typography.Title>
      <Row justify="center">
        <Col sm={24} md={12} lg={8} className="sh-code">
          <Typography.Text
            copyable
            className="sh-code-text"
            onCopy={() => logEvent(analytics, 'copy_gh_command')}
          >
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
            onPaste={() => logEvent(analytics, 'paste_command_output')}
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
            icon={<FilterFilled />}
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
            Well, what are you waiting for? Run the emulator above and the
            explanation will appear here.
          </Typography.Text>
        </div>
      )}
      <br />
      <Footer />
      <SignUpModal
        open={showSignupModal}
        onClose={() => setShowSignupModal(false)}
      />
    </div>
  );
}

export default Playground;
