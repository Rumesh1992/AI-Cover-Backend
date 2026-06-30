import mongoose from 'mongoose';

const resumeHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    targetRole: String,

    resumeText: String,

    jobDescription: String,

    atsScore: Number,

    missingKeywords: [String],

    professionalSummary: String,

    skills: [String],

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