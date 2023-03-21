import { Button, Card, Col, Result, Row, Typography } from 'antd';
import React from 'react';
import { Helmet } from 'react-helmet';

export default function Success() {
  const appUrl = 'https://github.com/apps/explain-this-pr';

  return (
    <div className="page-container">
      <Helmet>
        <title>ExplainThisPR - Welcome</title>
      </Helmet>
      <Typography.Title>Thank you! You're appreciated 🥳</Typography.Title>
      <Row justify="center">
        <Col span={8}>
          <Card>
            <Result
              status="success"
              title="You're all set"
              subTitle="You can now add the extension to your GitHub repo."
              extra={
                <Button
                  type="primary"
                  onClick={() => (window.location.href = appUrl)}
                >
                  Open Extension
                </Button>
              }
            />
          </Card>
        </Col>
      </Row>
      <br />
      <Row justify="center">
        <Col span={8}>
          <Card title="How To Use?">
            <Typography.Text>
              Add a comment to your PR that says
              <code>@explainthispr</code> and we will analyze your code to add a
              comment explaining the changes.
            </Typography.Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
