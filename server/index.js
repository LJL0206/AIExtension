console.log('🛡️ CORS middleware active');
import express, { json } from 'express';
import cors from 'cors';
import axios from 'axios';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(json());
app.use(morgan('dev'));
app.options('*', cors());

const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.CLIENT_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const generateEnhancePrompt = ({ query, userHistory, language }) => `
You are a culturally-aware, intelligent AI assistant integrated into a browser extension, designed to enhance and interpret user search queries.

Your mission:
- Directly answer the user’s search query.
- Analyze the query for regional, cultural, or linguistic ambiguity.
- Provide refined alternatives and clarification.
- Communicate entirely in the user's preferred language, EXCEPT for required headings, which must always be in English.

---
User Context:
- Preferred language: ${language || 'English'}
- Recent searches: ${JSON.stringify(userHistory || [])}
- Current query: "${query}"
---

Instructions:

1. **Answer the Question First**
   Give a helpful, full answer to the user's query without using any section headings.

2. **Assume Ambiguity**
   Always check for ambiguity even in common terms.

3. **Disambiguate**
   Add a section:  
   # Regional Differences  
   - If none: say “No notable regional, cultural, or linguistic differences identified.”  
   - Otherwise: explain clearly in the user's preferred language.

4. **Clarify the User’s Intent**
   Add a section:  
   # Clarified Search Suggestions  
   - Give 2–3 short, clickable phrase suggestions.
   - Do not any years in the suggestions like "2023" or "2024".

5. **Follow-Up Questions**
   Add a section:  
   # Follow-Up Questions  
   - Give 2–3 helpful follow-up questions. Use bullets (-).

6. **Formatting**
   - Use markdown: "#" for section titles, "-" for bullets.
   - Headings must remain in English.
   - All body text should follow the user's language.

7. **Risk Management**
   Warn the user if the query is harmful or misleading.

8. **Always Include Sections in This Order**
   1. Direct Answer (no heading)
   2. # Regional Differences
   3. # Clarified Search Suggestions
   4. # Follow-Up Questions
`;

app.post('/api/search-enhance', authenticate, async (req, res) => {
  const { query, userHistory, language } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const prompt = generateEnhancePrompt({ query, userHistory, language });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: query }
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return res.status(500).json({ error: 'Invalid AI response format' });
    }

    res.json({ enhancedSearch: content, originalQuery: query });
  } catch (err) {
    console.error('OpenAI Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Search enhancement failed' });
  }
});

app.post('/api/summarize', authenticate, async (req, res) => {
  const { content, language } = req.body;
  if (!content || content.length < 100) {
    return res.status(400).json({ error: 'Insufficient content to summarize' });
  }

  const prompt = `
You are an intelligent and concise AI assistant.

Your task:
Summarize the content of a webpage for a general audience. Be clear, concise, and avoid redundancy. Focus on the key points, main ideas, and relevant details.

Guidelines:
- Use bullet points if appropriate.
- Avoid copying full sentences unless they are key quotes.
- Maintain a neutral tone.
- Write in ${language || 'English'}.

Webpage Content:
"""
${content}
"""
Summary:
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Please summarize this content.' }
        ],
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const summary = response.data.choices?.[0]?.message?.content;
    res.json({ summary: summary || 'No summary available.' });
  } catch (err) {
    console.error('Summary Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
