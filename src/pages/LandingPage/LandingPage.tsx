import { Button, Col, Input, Row, Typography, message } from 'antd';
import axios from 'axios';
import React from 'react';
import './LandingPage.css';

function LandingPage() {
  const [diff, setDiff] = React.useState('');
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
      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.error(error);
      message.error('Something went wrong. Please try again');
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
            placeholder="Paste your PR diff here"
            autoSize={{ minRows: 10, maxRows: 20 }}
            onChange={(e) => setDiff(e.target.value)}
            value={diff}
          />
        </Col>
      </Row>
      <Row justify="center">
        <Button size="large" onClick={handleExplain} loading={loading}>
          Explain this PR
        </Button>
      </Row>
    </div>
  );
}

export default LandingPage;
