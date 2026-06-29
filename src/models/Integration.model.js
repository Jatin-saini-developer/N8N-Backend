import mongoose from 'mongoose'

const IntegrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['github', 'slack', 'jira', 'notion'],
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
      // select: false — yeh bahut sensitive data hai,
      // by default kisi query mein nahi aana chahiye
    },
    providerAccountId: {
      type: String,
      // GitHub/Slack pe us account ka unique ID —
      // future mein useful hoga verify karne ke liye
      default: null,
    },
    providerUsername: {
      type: String,
      // jaise GitHub username — UI mein dikhane ke liye
      // "Connected as @jatinsaini"
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// Ek user ek provider ko sirf EK BAAR connect kar sakta hai
IntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true })

const Integration = mongoose.model('Integration', IntegrationSchema)

export default Integration