import mongoose from 'mongoose'
import Workflow from '../../models/Workflow.model.js'
import WorkflowData from '../../models/WorkflowData.model.js'
import Execution from '../../models/Execution.model.js'
import ApiError from '../../utils/ApiError.js'
import logger from '../../config/logger.js'
import { executeWorkflow } from '../execution/executor/workflowExecutor.js'

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

// ─────────────────────────────────────────────────────────────────────────────
//  EXECUTE WORKFLOW
//  — Load workflow + nodes/edges
//  — Create Execution document (status: running)
//  — Call workflowExecutor engine
//  — Persist result back to Execution document
//  — Ownership check mandatory
// ─────────────────────────────────────────────────────────────────────────────
export const executeWorkflowService = async ({
  workflowId,
  userId,
  triggerData,
}) => {
  // ── 1. Load workflow + ownership check ──────────────────────────────────
  const workflow = await Workflow.findById(workflowId)

  if (!workflow) {
    throw new ApiError(404, 'Workflow not found')
  }

  if (workflow.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'You do not have permission to execute this workflow')
  }

  // ── 2. Load nodes and edges ─────────────────────────────────────────────
  const workflowData = await WorkflowData.findOne({ workflowId: workflow._id })

  if (!workflowData || workflowData.nodes.length === 0) {
    throw new ApiError(400, 'Workflow has no nodes to execute')
  }

  // ── 3. Create Execution document ────────────────────────────────────────
  const execution = await Execution.create({
    workflowId: workflow._id,
    userId,
    status: 'running',
    triggerData,
    startedAt: new Date(),
    steps: workflowData.nodes.map((node) => ({
      nodeId: node.id,
      nodeType: node.type,
      status: 'pending',
    })),
  })

  logger.info(`Execution started: ${execution._id} for workflow: ${workflowId} by user: ${userId}`)

  // ── 4. Run the engine ───────────────────────────────────────────────────
  const context = {
    workflowId: workflowId.toString(),
    userId: userId.toString(),
    executionId: execution._id.toString(),
    triggerPayload: triggerData,
  }

  let result
  try {
    result = await executeWorkflow({
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      context,
    })
  } catch (error) {
    // Engine threw unexpectedly — mark execution as failed
    execution.status = 'failed'
    execution.error = error.message
    execution.completedAt = new Date()
    execution.durationMs = execution.completedAt - execution.startedAt
    await execution.save()

    logger.error(`Execution failed: ${execution._id} — ${error.message}`)
    throw new ApiError(500, 'Workflow execution failed unexpectedly')
  }

  // ── 5. Persist results ──────────────────────────────────────────────────
  execution.status = result.status === 'success' ? 'completed' : 'failed'
  execution.completedAt = new Date()
  execution.durationMs = execution.completedAt - execution.startedAt

  // Update each step with the executor's result
  if (result.nodeResults && result.nodeResults.length > 0) {
    for (const nodeResult of result.nodeResults) {
      const step = execution.steps.find((s) => s.nodeId === nodeResult.nodeId)
      if (step) {
        step.status = nodeResult.status === 'success' ? 'success' : 'failed'
        step.startedAt = nodeResult.startedAt
        step.completedAt = nodeResult.finishedAt
        step.durationMs = nodeResult.duration
        step.logs = [
          nodeResult.message || `${nodeResult.nodeType} node ${nodeResult.status}`,
        ]
      }
    }

    // Mark remaining pending steps as skipped
    for (const step of execution.steps) {
      if (step.status === 'pending') {
        step.status = 'skipped'
      }
    }
  }

  await execution.save()

  logger.info(
    `Execution completed: ${execution._id} — status=${execution.status} ` +
    `duration=${execution.durationMs}ms`
  )

  return {
    executionId: execution._id,
    workflowId: workflow._id,
    status: execution.status,
    triggerData: execution.triggerData,
    steps: execution.steps,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    error: execution.error,
    summary: {
      totalNodes: result.totalNodes,
      successfulNodes: result.successfulNodes,
      failedNodes: result.failedNodes,
      skippedNodes: result.skippedNodes,
    },
  }
}