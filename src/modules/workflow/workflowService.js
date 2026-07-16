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
  logger.debug(`[EXEC-TRACE] ──── STAGE 1: LOAD WORKFLOW ────`)
  logger.debug(`[EXEC-TRACE] Looking up workflow: ${workflowId}`)
  const workflow = await Workflow.findById(workflowId)

  if (!workflow) {
    logger.debug(`[EXEC-TRACE] ✘ Workflow not found: ${workflowId}`)
    throw new ApiError(404, 'Workflow not found')
  }

  logger.debug(`[EXEC-TRACE] ✔ Workflow loaded: name="${workflow.name}", status="${workflow.status}", nodeCount=${workflow.nodeCount}`)

  if (workflow.userId.toString() !== userId.toString()) {
    logger.debug(`[EXEC-TRACE] ✘ Ownership mismatch: workflow.userId=${workflow.userId}, request.userId=${userId}`)
    throw new ApiError(403, 'You do not have permission to execute this workflow')
  }
  logger.debug(`[EXEC-TRACE] ✔ Ownership verified`)

  // ── 2. Load nodes and edges ─────────────────────────────────────────────
  logger.debug(`[EXEC-TRACE] ──── STAGE 2: LOAD WORKFLOW DATA ────`)
  const workflowData = await WorkflowData.findOne({ workflowId: workflow._id })

  if (!workflowData || workflowData.nodes.length === 0) {
    logger.debug(`[EXEC-TRACE] ✘ No nodes found — workflowData exists: ${!!workflowData}, nodeCount: ${workflowData?.nodes?.length ?? 0}`)
    throw new ApiError(400, 'Workflow has no nodes to execute')
  }

  logger.debug(`[EXEC-TRACE] ✔ WorkflowData loaded — ${workflowData.nodes.length} nodes, ${workflowData.edges.length} edges`)
  logger.debug(`[EXEC-TRACE] Node types: ${workflowData.nodes.map(n => `${n.id}(${n.type})`).join(' → ')}`)
  logger.debug(`[EXEC-TRACE] Edges: ${workflowData.edges.map(e => `${e.source}→${e.target}`).join(', ')}`)
  // Log each node's data keys to spot missing config
  workflowData.nodes.forEach(n => {
    logger.debug(`[EXEC-TRACE]   Node ${n.id} (${n.type}): data keys = ${n.data ? Object.keys(n.data).join(', ') : 'NO DATA'}`)
    if (n.data) {
      logger.debug(`[EXEC-TRACE]   Node ${n.id} data: ${JSON.stringify(n.data)}`)
    }
  })

  // ── 3. Create Execution document ────────────────────────────────────────
  logger.debug(`[EXEC-TRACE] ──── STAGE 3: CREATE EXECUTION DOCUMENT ────`)
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
  logger.debug(`[EXEC-TRACE] ✔ Execution document created: ${execution._id}`)
  logger.debug(`[EXEC-TRACE] Steps initialized: ${execution.steps.map(s => `${s.nodeId}(${s.nodeType}:${s.status})`).join(', ')}`)

  logger.info(`Execution started: ${execution._id} for workflow: ${workflowId} by user: ${userId}`)

  // ── 4. Run the engine ───────────────────────────────────────────────────
  logger.debug(`[EXEC-TRACE] ──── STAGE 4: CALL WORKFLOW EXECUTOR ────`)
  const context = {
    workflowId: workflowId.toString(),
    userId: userId.toString(),
    executionId: execution._id.toString(),
    triggerPayload: triggerData,
  }
  logger.debug(`[EXEC-TRACE] Engine context: ${JSON.stringify(context)}`)

  let result
  try {
    // [NODE-TRACE] Stage 5: Nodes being passed to workflowExecutor
    const ghNodes5 = workflowData.nodes.filter(n => n.type === 'github')
    console.log(`[NODE-TRACE] [5/8 executeWorkflowService] Passing ${workflowData.nodes.length} nodes to executor. GitHub: ${ghNodes5.length}`)
    ghNodes5.forEach(n => {
      console.log(`[NODE-TRACE] [5/8 executeWorkflowService] GitHub node:`, JSON.stringify({ id: n.id, type: n.type, data: n.data }, null, 2))
    })
    console.log(`[NODE-TRACE] [5/8 executeWorkflowService] ALL nodes:`, JSON.stringify(workflowData.nodes.map(n => ({ id: n.id, type: n.type, data: n.data })), null, 2))

    logger.debug(`[EXEC-TRACE] Calling executeWorkflow()...`)
    result = await executeWorkflow({
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      context,
    })
    logger.debug(`[EXEC-TRACE] ✔ Engine returned — status=${result.status}, totalNodes=${result.totalNodes}, success=${result.successfulNodes}, failed=${result.failedNodes}, skipped=${result.skippedNodes}`)
    logger.debug(`[EXEC-TRACE] Engine duration: ${result.duration}ms`)
    if (result.error) {
      logger.debug(`[EXEC-TRACE] Engine error field: ${result.error}`)
    }
    // Log each node result from the engine
    if (result.nodeResults) {
      result.nodeResults.forEach((nr, i) => {
        logger.debug(`[EXEC-TRACE]   nodeResult[${i}]: id=${nr.nodeId}, type=${nr.nodeType}, status=${nr.status}, msg="${nr.message || 'N/A'}", duration=${nr.duration}ms`)
        if (nr.error) {
          logger.debug(`[EXEC-TRACE]   nodeResult[${i}] error: ${nr.error}`)
        }
      })
    }
  } catch (error) {
    // Engine threw unexpectedly — mark execution as failed
    logger.debug(`[EXEC-TRACE] ✘ Engine threw exception: ${error.message}`)
    logger.debug(`[EXEC-TRACE] Error name: ${error.name}, code: ${error.code || 'N/A'}`)
    logger.debug(`[EXEC-TRACE] Stack: ${error.stack}`)
    execution.status = 'failed'
    execution.error = error.message
    execution.completedAt = new Date()
    execution.durationMs = execution.completedAt - execution.startedAt
    await execution.save()

    logger.error(`Execution failed: ${execution._id} — ${error.message}`)
    throw new ApiError(500, 'Workflow execution failed unexpectedly')
  }

  // ── 5. Persist results ──────────────────────────────────────────────────
  logger.debug(`[EXEC-TRACE] ──── STAGE 5: PERSIST RESULTS ────`)
  execution.status = result.status === 'success' ? 'completed' : 'failed'
  execution.completedAt = new Date()
  execution.durationMs = execution.completedAt - execution.startedAt
  logger.debug(`[EXEC-TRACE] Execution final status: ${execution.status}`)

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
        logger.debug(`[EXEC-TRACE]   Step ${step.nodeId} → ${step.status} (${step.durationMs}ms) — log: "${step.logs[0]}"`)
      } else {
        logger.debug(`[EXEC-TRACE]   ⚠ No step found for nodeResult.nodeId=${nodeResult.nodeId}`)
      }
    }

    // Mark remaining pending steps as skipped
    for (const step of execution.steps) {
      if (step.status === 'pending') {
        step.status = 'skipped'
        logger.debug(`[EXEC-TRACE]   Step ${step.nodeId} → skipped (was still pending)`)
      }
    }
  }

  await execution.save()
  logger.debug(`[EXEC-TRACE] ✔ Execution document saved`)

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