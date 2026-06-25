import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/anthropic/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const apiKey = authHeader.split(' ')[1];

  try {
    const client = new Anthropic({ apiKey });

    // Pass the payload directly to Anthropic
    const response = await client.messages.create(req.body);

    res.json(response);
  } catch (error) {
    console.error('Anthropic API Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'An error occurred while communicating with the Anthropic API'
    });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});
