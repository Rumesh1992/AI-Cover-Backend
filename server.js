import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

import connectDB from './config/db.js';
import ResumeHistory from './models/ResumeHistory.js';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import InterviewHistory from './models/InterviewHistory.js';
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
app.post('/api/resume/download-docx', async (req, res) => {
  try {
    const { content } = req.body;

    const doc = new Document({
      sections: [
        {
          children: content.split('\n').map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                  }),
                ],
              }),
          ),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=ATS-Optimized-Resume.docx',
    );

    res.send(buffer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'DOCX generation failed',
    });
  }
});

app.post('/api/interview/generate', async (req, res) => {
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
You are a senior technical interviewer and career coach.

Target role:
${targetRole || 'Software Engineer'}

Candidate resume:
${resumeText}

Job description:
${jobDescription}

Generate interview questions tailored to this candidate and job.

Return ONLY valid JSON in this exact structure:

{
  "reactQuestions": [],
  "typescriptQuestions": [],
  "systemDesignQuestions": [],
  "behavioralQuestions": [],
  "roleSpecificQuestions": []
}

Rules:
- Each array must contain 5 questions.
- Questions must be practical and job-relevant.
- Include questions based on technologies found in resume and job description.
- Do not include explanations outside JSON.
- Do not wrap JSON in markdown.
`,
    });

    const aiText = response.output_text?.trim();

    if (!aiText) {
      return res.status(500).json({
        message: 'Empty AI response',
      });
    }

    const parsedResult = JSON.parse(aiText);

    return res.json(parsedResult);
  } catch (error) {
    console.error('Interview question generation failed:', error);

    return res.status(500).json({
      message: 'Interview question generation failed',
    });
  }
});

app.post('/api/resume/rewrite', async (req, res) => {
  try {
    const { targetRole, resumeText, jobDescription, resumeTemplate } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        message: 'Resume text and job description are required',
      });
    }

    const templateStyle = resumeTemplate || 'ats';

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: `
You are an expert ATS resume writer and senior technical recruiter.

Target role:
${targetRole || 'Software Engineer'}

Resume template style:
${templateStyle}

Template rules:
- ats: Simple ATS-friendly format with clear headings, clean structure, and no graphics.
- modern: Clean modern format with stronger wording, concise sections, and recruiter-friendly readability.
- executive: Leadership-focused format with strategic impact, senior tone, ownership, delivery, and business value.
- techlead: Technical leadership format emphasizing architecture, mentoring, code quality, scalability, delivery, and engineering practices.

Current resume:
${resumeText}

Job description:
${jobDescription}

Task:
Rewrite the resume to better match the job description while keeping it truthful and based ONLY on the provided resume.

Very important rules:
- Use ONLY information from the provided resume.
- Do NOT invent fake companies, fake projects, fake degrees, fake certifications, fake metrics, or fake experience.
- Preserve real company names, project names, job titles, technologies, and dates if they exist in the resume.
- Do NOT replace real experience with generic placeholders like "5 years of experience".
- Improve ATS keyword alignment using the job description only when it is truthful.
- Improve wording, structure, bullet points, and professional tone.
- Do not summarize responsibilities.
- Expand existing experience into strong ATS-style resume bullet points.
- Each Work Experience section should contain 5-8 detailed, achievement-oriented bullet points when enough information is available.
- Each Project section should contain 3-5 detailed bullet points when enough information is available.
- Avoid generic statements such as "Worked on applications", "Built web applications", or "Collaborated with teams".
- Prefer technology-specific and achievement-oriented bullets.
- If template style is "executive", emphasize leadership, business value, stakeholder collaboration, ownership, and delivery impact.
- If template style is "techlead", emphasize architecture, mentoring, code quality, technical decisions, scalability, and engineering practices.
- If template style is "modern", use concise, polished wording and avoid overly long bullet points.
- If template style is "ats", prioritize ATS keywords, simple formatting, and clear section headings.
- Keep the resume concise, clear, and recruiter-friendly.
- If Education or Certifications are not provided, omit that section completely.
- Return ONLY the rewritten resume text. Do not include explanations.

Required output format:

PROFESSIONAL SUMMARY

TECHNICAL SKILLS

WORK EXPERIENCE

PROJECTS

EDUCATION & CERTIFICATIONS
`,
    });

    const rewrittenResume = response.output_text?.trim();

    if (!rewrittenResume) {
      return res.status(500).json({
        message: 'Empty AI response',
      });
    }

    return res.json({
      rewrittenResume,
    });
  } catch (error) {
    console.error('Resume rewrite failed:', error);

    return res.status(500).json({
      message: 'Resume rewrite failed',
    });
  }
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