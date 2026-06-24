import mongoose from 'mongoose';

const resumeHistorySchema = new mongoose.Schema(
  {
    targetRole: {
      type: String,
      default: '',
    },
    resumeText: String,
    jobDescription: String,

    atsScore: Number,

    missingKeywords: {
      type: [String],
      default: [],
    },

    professionalSummary: String,

    skills: {
      type: [String],
      default: [],
    },

    coverLetter: String,
  },
  {
    timestamps: true,
  },
);

export default mongoose.model(
  'ResumeHistory',
  resumeHistorySchema,
);