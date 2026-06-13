import mongoose from "mongoose";

const workflowSchema = new mongoose.Schema({
    name: {
      type: String,
      required: [true, 'Workflow name is required'],
      trim: true,
      minlength: [1, 'Name cannot be empty'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // ← fast lookup by user
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      default: 'draft',
      index: true, // ← fast filter by status
    },
    nodeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastRun: {
      type: Date,
      default: null,
    },

},
{
    timestamps: true,
})

// ─── Compound indexes ─────────────────────────────────────────────────────────

// Dashboard query — user ke saare workflows, latest pehle
workflowSchema.index({ userId: 1, createdAt: -1 })

// Filter by status — user ke active workflows
workflowSchema.index({ userId: 1, status: 1 })

const Workflow = mongoose.model('Workflow', workflowSchema)
export default Workflow
