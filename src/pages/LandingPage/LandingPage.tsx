import { Button, Col, Input, Row, Typography, message, Divider } from 'antd';
import axios from 'axios';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';
import './LandingPage.css';

function LandingPage() {
  const [diff, setDiff] = React.useState('');
  const [result, setResult] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // Call the Firebase Function with diff_body as the body
  const handleExplain = async () => {
    try {
      setLoading(true);
      const URL =
        'http://localhost:5001/explain-this-pr/us-central1/githubWebhook';
      //'https://us-central1-explain-this-pr.cloudfunctions.net/githubWebhook';
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

  return (
    <div className="LandingPage">
      <Typography.Title>ExplainThisPR</Typography.Title>
      <Typography.Paragraph>
        1. Use the Github CLI to run this command:
      </Typography.Paragraph>
      <Row justify="center">
        <Col span={18}>
          <Input.TextArea
            className="textarea font-mono"
            placeholder="Paste your PR diff here"
            autoSize={{ minRows: 10, maxRows: 20 }}
            onChange={(e) => setDiff(e.target.value)}
            value={diff}
          />
        </Col>
      </Row>
      <br />
      <Row justify="center">
        <Button size="large" onClick={handleExplain} loading={loading}>
          Explain this PR
        </Button>
      </Row>
      <Divider />
      <ReactMarkdown
        className="markdown-container font-mono"
        remarkPlugins={[remarkGfm, remarkGemoji]}
      >
        {result}
      </ReactMarkdown>
    </div>
  );
}

export default LandingPage;
