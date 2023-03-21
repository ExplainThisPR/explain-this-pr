import {
  Button,
  Col,
  Input,
  Row,
  Typography,
  message,
  Divider,
  Space,
} from 'antd';
import axios from 'axios';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';
import './LandingPage.css';
import SignUpModal from '../../components/SignUpModal';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { Helmet } from 'react-helmet';
import Footer from '../../components/Footer';
import { Link } from 'react-router-dom';

function LandingPage() {
  const [diff, setDiff] = React.useState('');
  const [result, setResult] = React.useState('');
  const [loading, setLoading] = React.useState(false);
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
  const command = [
    'gh api \\',
    '-H "Accept: application/vnd.github+json" \\',
    '-H "X-GitHub-Api-Version: 2022-11-28" \\',
    '/repos/[OWNER]/[REPO]/pulls/[PULL]/files \\',
    '> output.json',
  ].join('\n');

  const howItWorks = [
    {
      title: 'Install the GitHub Integration',
      description:
        'The extension is free to use and takes less than 2 minutes to set up.',
      image: 'https://i.imgur.com/1ZQ2Z9M.png',
    },
    {
      title: 'Add a comment to your PR',
      description: (
        <>
          Post a comment that says <code>@ExplainThisPR</code> to queue up a
          job.
        </>
      ),
      image: 'https://i.imgur.com/1ZQ2Z9M.png',
    },
    {
      title: "That's it. You're done! 🎉",
      description:
        'Our bot will post a comment with a summary of the changes in a few seconds.',
    },
  ];
  const benefits = [
    {
      title: 'Saves time',
      description:
        'Quick summaries reduce time spent on reviewing lengthy code.',
    },
    {
      title: 'Improves efficiency',
      description:
        'Enables engineers to focus on critical issues and prioritize tasks.',
    },
    {
      title: 'Faster ticket resolution',
      description: 'Accelerates the approval or revision processes.',
    },
    {
      title: 'Removes friction',
      description:
        'Tickets will no longer be blocked at the dreaded code review stage.',
    },
    {
      title: 'Empowers new hires',
      description:
        'The summary fills in the context gasp, allowing new hires to confidently grasp project updates more easily.',
    },
    {
      title: 'Better software quality',
      description:
        'Eliminates blind spots in code reviews to see the big picture implications more clearly.',
    },
  ];

  return (
    <>
      <Helmet>
        <title>Summarize pull requests in seconds - ExplainThisPR</title>
      </Helmet>
      <header className="hero-container glass-bg">
        <Row justify="center" className="hero-body">
          <Col sm={24} md={12} lg={8}>
            <Typography.Title>
              Never skim through a code review again
            </Typography.Title>
            <Typography.Title level={4}>
              ExplainThisPR is a GitHub integration that summarizes pull
              requests, delivering 80% understanding in just 20% of the time
            </Typography.Title>
            <br />
            <br />
            <Row>
              <Button size="large" type="primary" onClick={openSignupButton}>
                Sign Up With GitHub
              </Button>
            </Row>
          </Col>
          <Col sm={24} md={12}>
            <div
              style={{
                minWidth: 250,
                width: '100%',
                height: 300,
                backgroundColor: 'gray',
                borderRadius: 4,
              }}
            />
          </Col>
        </Row>
      </header>
      <div className="page-container">
        <Typography.Title>How It Works</Typography.Title>
        <Row justify={'space-around'} gutter={16}>
          {howItWorks.map((item, index) => (
            <Col key={item.title} sm={20} md={6} className="text-align-left">
              <Typography.Title level={2}>
                {index + 1}. {item.title}
              </Typography.Title>
              <Typography.Text className="supporting-text">
                {item.description}
              </Typography.Text>
              <Row>
                <div
                  style={{
                    minWidth: 250,
                    width: '100%',
                    height: 300,
                    backgroundColor: 'gray',
                    borderRadius: 4,
                  }}
                />
              </Row>
            </Col>
          ))}
        </Row>
        <br />
        <Typography.Title>Benefits</Typography.Title>
        <Row justify="space-evenly" gutter={24}>
          {benefits.map((item, index) => (
            <Col key={item.title} sm={12} md={8}>
              <Row>
                <Typography.Title level={3}>{item.title}</Typography.Title>
              </Row>
              <Row>
                <Typography.Text className="supporting-text text-align-left">
                  {item.description}
                </Typography.Text>
              </Row>
            </Col>
          ))}
        </Row>
        <br />
        <br />
        <Typography.Title>See It In Action?</Typography.Title>
        <Space size="middle">
          <Link to="/playground">
            <Button size="large">Open playground</Button>
          </Link>
          <Button type="primary" size="large">
            Sign Up With Github
          </Button>
        </Space>
        <Divider />
        <br />
        <Footer />
        <SignUpModal
          open={showSignupModal}
          onClose={() => setShowSignupModal(false)}
        />
      </div>
    </>
  );
}

export default LandingPage;
