import mongoose from 'mongoose'

// ─── Node schema ─────────────────────────────────────────────────────────────
const nodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['trigger', 'github', 'slack', 'jira', 'notion'],
    },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    data: {
      type: mongoose.Schema.Types.Mixed, // flexible — har node ka data alag hoga
      default: {},
    },
  },
  { _id: false } // ← apna _id nahi chahiye — React Flow ka id use karenge
)

// ─── Edge schema ─────────────────────────────────────────────────────────────
const edgeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    animated: { type: Boolean, default: true },
  },
  { _id: false } // ← same reason
)

// ─── WorkflowData schema ──────────────────────────────────────────────────────
const workflowDataSchema = new mongoose.Schema(
  {
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      unique: true, // ← ek workflow ka sirf ek data document
      index: true,
    },
    nodes: {
      type: [nodeSchema],
      default: [],
      validate: {
        validator: (nodes) => nodes.length <= 50,
        message: 'Workflow cannot have more than 50 nodes',
      },
    },
    edges: {
      type: [edgeSchema],
      default: [],
      validate: {
        validator: (edges) => edges.length <= 100,
        message: 'Workflow cannot have more than 100 edges',
      },
    },
  },
  {
    timestamps: true,
  }
)

const WorkflowData = mongoose.model('WorkflowData', workflowDataSchema)

export default WorkflowData