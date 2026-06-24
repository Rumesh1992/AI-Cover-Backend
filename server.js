import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

import connectDB from './config/db.js';
import ResumeHistory from './models/ResumeHistory.js';

dotenv.config();

connectDB();

const app = express();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API running',
  });
});

app.post('/api/resume/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'Resume file is required',
      });
    }

    let text = '';

    if (req.file.mimetype === 'application/pdf') {
      const parser = new PDFParse({
        data: req.file.buffer,
      });

      const data = await parser.getText();
      text = data.text?.trim() || '';
    } else if (
      req.file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const data = await mammoth.extractRawText({
        buffer: req.file.buffer,
      });

      text = data.value?.trim() || '';
    } else {
      return res.status(400).json({
        message: 'Only PDF and DOCX files are allowed',
      });
    }

    if (!text) {
      return res.status(400).json({
        message: 'No readable text found in file',
      });
    }

    return res.json({
      text,
    });
  } catch (error) {
    console.error('Resume upload failed:', error);

    return res.status(500).json({
      message: 'Failed to read resume file',
    });
  }
});

app.post('/api/resume/generate', async (req, res) => {
  try {
    const { targetRole, resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        message: 'Resume text and job description are required',
      });
    }

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: `
You are an expert career coach and ATS resume optimization assistant.

Target role:
${targetRole || 'Software Engineer'}

Resume:
${resumeText}

Job description:
${jobDescription}

Return ONLY valid JSON in this exact structure:

{
  "atsScore": 0,
  "missingKeywords": [],
  "professionalSummary": "",
  "skills": [],
  "coverLetter": ""
}

Rules:
- atsScore must be a number between 0 and 100
- missingKeywords must be an array of strings
- skills must be an array of strings
- professionalSummary must be plain text
- coverLetter must be plain text
- Do not invent fake experience
- Do not wrap JSON in markdown
- Do not add explanations outside JSON
`,
    });

    const aiText = response.output_text?.trim();

    if (!aiText) {
      return res.status(500).json({
        message: 'Empty AI response',
      });
    }

    const parsedResult = JSON.parse(aiText);

    const savedHistory = await ResumeHistory.create({
      targetRole: targetRole || 'Software Engineer',
      resumeText,
      jobDescription,
      atsScore: parsedResult.atsScore,
      missingKeywords: parsedResult.missingKeywords,
      professionalSummary: parsedResult.professionalSummary,
      skills: parsedResult.skills,
      coverLetter: parsedResult.coverLetter,
    });

    return res.json({
      ...parsedResult,
      id: savedHistory._id,
      createdAt: savedHistory.createdAt,
    });
  } catch (error) {
    console.error('AI generation failed:', error);

    return res.status(500).json({
      message: 'AI generation failed',
    });
  }
});

app.get('/api/resume/history', async (req, res) => {
  try {
    const history = await ResumeHistory.find()
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json(history);
  } catch (error) {
    console.error('History fetch failed:', error);

    return res.status(500).json({
      message: 'Failed to fetch resume history',
    });
  }
});

app.delete('/api/resume/history/:id', async (req, res) => {
  try {
    await ResumeHistory.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: 'History item deleted',
    });
  } catch (error) {
    console.error('History delete failed:', error);

    return res.status(500).json({
      message: 'Failed to delete history item',
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});