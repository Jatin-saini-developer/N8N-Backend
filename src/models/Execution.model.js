import mongoose from 'mongoose'

// ─── ExecutionStep sub-schema ─────────────────────────────────────────────────
const executionStepSchema = new mongoose.Schema(
  {
    nodeId: {
      type: String,
      required: true,
    },
    nodeType: {
      type: String,
      enum: ['trigger', 'github', 'slack', 'jira', 'notion'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'success', 'failed', 'skipped'],
      default: 'pending',
    },
    logs: {
      type: [String],
      default: [],
      // Each log entry is a string — "Invited user@email.com to org my-company"
      // or "Error: Resource not accessible by integration"
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
      // Calculated: completedAt - startedAt
      // Useful for performance monitoring at scale
    },
  },
  { _id: true } // Each step needs its own _id for targeted updates
)

// ─── Execution schema ─────────────────────────────────────────────────────────
const executionSchema = new mongoose.Schema(
  {
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    triggerData: {
      name: {
        type: String,
        required: [true, 'New developer name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters'],
      },
      email: {
        type: String,
        required: [true, 'New developer email is required'],
        lowercase: true,
        trim: true,
      },
      githubUsername: {
        type: String,
        default: null,
        trim: true,
        // Optional — if provided, used for GitHub invite
        // If not provided, email-based invite is used
      },
    },
    steps: {
      type: [executionStepSchema],
      default: [],
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    error: {
      type: String,
      default: null,
      // Top-level error — only set if execution fails catastrophically
      // before any steps run (e.g. workflow not found, no integrations)
    },
  },
  {
    timestamps: true, // createdAt = when Run was clicked
  }
)

// ─── Compound indexes ─────────────────────────────────────────────────────────

// Most common query — "show me all runs for this workflow"
executionSchema.index({ workflowId: 1, createdAt: -1 })

// "show me all runs by this user"
executionSchema.index({ userId: 1, createdAt: -1 })

// "show me all running executions" — for monitoring + preventing duplicate runs
executionSchema.index({ workflowId: 1, status: 1 })

// ─── Model ───────────────────────────────────────────────────────────────────
const Execution = mongoose.model('Execution', executionSchema)

export default Execution