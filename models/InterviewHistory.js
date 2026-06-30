import mongoose from 'mongoose';

const interviewHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    targetRole: String,

    resumeText: String,

    jobDescription: String,

    reactQuestions: [String],

    typescriptQuestions: [String],

    systemDesignQuestions: [String],

    behavioralQuestions: [String],

    roleSpecificQuestions: [String],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('InterviewHistory', interviewHistorySchema);