import mongoose from 'mongoose'
import Workflow from '../../models/Workflow.model.js'
import WorkflowData from '../../models/WorkflowData.model.js'
import ApiError from '../../utils/ApiError.js'
import logger from '../../config/logger.js'

// ─────────────────────────────────────────────────────────────────────────────
//  CREATE WORKFLOW
//  — Naya workflow + empty WorkflowData ek saath create hoga
//  — Atomic operation — dono save hone chahiye ya dono nahi
// ─────────────────────────────────────────────────────────────────────────────
export const createWorkflowService = async ({ name, description, userId }) => {
  // Start a session for atomic operation
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Both operations in same transaction
    const [workflow] = await Workflow.create(
      [{ name, description: description || '', userId }],
      { session }
    )

  // Create empty WorkflowData for this workflow
    await WorkflowData.create(
      [{ workflowId: workflow._id, nodes: [], edges: [] }],
      { session }
    )

    await session.commitTransaction()


    logger.info(`Workflow created: ${workflow._id} by user: ${userId}`)

    return workflow

  }  catch (error) {
    // Either failed — rollback both
    await session.abortTransaction()
    logger.error(`Workflow creation failed for user: ${userId} — ${error.message}`)
    throw new ApiError(500, 'Failed to create workflow')

  } finally {
    session.endSession()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET ALL WORKFLOWS
//  — Sirf us user ke workflows
//  — Pagination support — 1000 workflows ek saath nahi bhejenge
//  — Nodes/edges nahi bhejenge — sirf metadata
// ─────────────────────────────────────────────────────────────────────────────
export const getAllWorkflowsService = async ({ userId, page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit

  // Run both queries in parallel — faster than sequential
  const [workflows, total] = await Promise.all([
    Workflow.find({ userId })
      .sort({ createdAt: -1 })  // latest pehle
      .skip(skip)
      .limit(limit)
      .select('-__v'),           // __v field ki zaroorat nahi frontend ko

    Workflow.countDocuments({ userId }),
  ])

  return {
    workflows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET SINGLE WORKFLOW
//  — Metadata + nodes + edges dono
//  — Ownership check — sirf apna workflow dekh sako
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkflowService = async ({ workflowId, userId }) => {
  const workflow = await Workflow.findById(workflowId).select('-__v')

  if (!workflow) {
    throw new ApiError(404, 'Workflow not found')
  }

  // Ownership check — kisi aur ka workflow nahi dekh sakte
  if (workflow.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'You do not have permission to access this workflow')
  }

  // Fetch nodes and edges
  const workflowData = await WorkflowData.findOne({
    workflowId: workflow._id,
  }).select('-__v -workflowId')

  return {
    ...workflow.toObject(),
    nodes: workflowData?.nodes || [],
    edges: workflowData?.edges || [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UPDATE WORKFLOW
//  — Name, description update → Workflow collection
//  — Nodes, edges update → WorkflowData collection
//  — nodeCount automatically update hoga
//  — Ownership check mandatory
// ─────────────────────────────────────────────────────────────────────────────
export const updateWorkflowService = async ({
  workflowId,
  userId,
  name,
  description,
  nodes,
  edges,
}) => {
  const workflow = await Workflow.findById(workflowId)

  if (!workflow) {
    throw new ApiError(404, 'Workflow not found')
  }

  // Ownership check
  if (workflow.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'You do not have permission to update this workflow')
  }

  // Update metadata if provided
  if (name !== undefined) workflow.name = name
  if (description !== undefined) workflow.description = description

  // Update nodeCount if nodes are being saved
  if (nodes !== undefined) {
    workflow.nodeCount = nodes.length
  }

  await workflow.save()

  // Update nodes and edges if provided
  if (nodes !== undefined || edges !== undefined) {
    await WorkflowData.findOneAndUpdate(
      { workflowId: workflow._id },
      {
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
      },
      {
        new: true,
        runValidators: true, // schema validation run hogi
      }
    )
  }

  logger.info(`Workflow updated: ${workflowId} by user: ${userId}`)

  return workflow
}

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE WORKFLOW
//  — Workflow + WorkflowData dono delete
//  — Ownership check mandatory
// ─────────────────────────────────────────────────────────────────────────────
export const deleteWorkflowService = async ({ workflowId, userId }) => {
  const workflow = await Workflow.findById(workflowId)

  if (!workflow) {
    throw new ApiError(404, 'Workflow not found')
  }

  // Ownership check
  if (workflow.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'You do not have permission to delete this workflow')
  }

  // Delete both documents in parallel
  await Promise.all([
    Workflow.findByIdAndDelete(workflowId),
    WorkflowData.findOneAndDelete({ workflowId }),
  ])

  logger.info(`Workflow deleted: ${workflowId} by user: ${userId}`)

  return { id: workflowId }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UPDATE WORKFLOW STATUS
//  — draft → active → paused
//  — Ownership check mandatory
// ─────────────────────────────────────────────────────────────────────────────
export const updateWorkflowStatusService = async ({
  workflowId,
  userId,
  status,
}) => {
  const workflow = await Workflow.findById(workflowId)

  if (!workflow) {
    throw new ApiError(404, 'Workflow not found')
  }

  // Ownership check
  if (workflow.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'You do not have permission to update this workflow')
  }

  workflow.status = status
  await workflow.save()

  logger.info(`Workflow status updated: ${workflowId} → ${status} by user: ${userId}`)

  return workflow
}