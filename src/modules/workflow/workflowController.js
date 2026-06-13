import asyncHandler from '../../utils/asyncHandler.js'
import ApiResponse from '../../utils/ApiResponse.js'
import {
  createWorkflowService,
  getAllWorkflowsService,
  getWorkflowService,
  updateWorkflowService,
  deleteWorkflowService,
  updateWorkflowStatusService,
} from './workflowService.js'

// ─────────────────────────────────────────────────────────────────────────────
//  CREATE WORKFLOW
//  POST /api/v1/workflows
// ─────────────────────────────────────────────────────────────────────────────
export const createWorkflow = asyncHandler(async (req, res) => {
  const { name, description } = req.body

  const workflow = await createWorkflowService({
    name,
    description,
    userId: req.user._id,
  })

  return res.status(201).json(
    new ApiResponse(201, 'Workflow created successfully', { workflow })
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  GET ALL WORKFLOWS
//  GET /api/v1/workflows?page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
export const getAllWorkflows = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10

  // Prevent abuse — max 50 per page
  const safeLimit = Math.min(limit, 50)

  const data = await getAllWorkflowsService({
    userId: req.user._id,
    page,
    limit: safeLimit,
  })

  return res.status(200).json(
    new ApiResponse(200, 'Workflows fetched successfully', data)
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  GET SINGLE WORKFLOW
//  GET /api/v1/workflows/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkflow = asyncHandler(async (req, res) => {
  const data = await getWorkflowService({
    workflowId: req.params.id,
    userId: req.user._id,
  })

  return res.status(200).json(
    new ApiResponse(200, 'Workflow fetched successfully', data)
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  UPDATE WORKFLOW
//  PUT /api/v1/workflows/:id
// ─────────────────────────────────────────────────────────────────────────────
export const updateWorkflow = asyncHandler(async (req, res) => {
  const { name, description, nodes, edges } = req.body

  const workflow = await updateWorkflowService({
    workflowId: req.params.id,
    userId: req.user._id,
    name,
    description,
    nodes,
    edges,
  })

  return res.status(200).json(
    new ApiResponse(200, 'Workflow updated successfully', { workflow })
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE WORKFLOW
//  DELETE /api/v1/workflows/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteWorkflow = asyncHandler(async (req, res) => {
  const data = await deleteWorkflowService({
    workflowId: req.params.id,
    userId: req.user._id,
  })

  return res.status(200).json(
    new ApiResponse(200, 'Workflow deleted successfully', data)
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  UPDATE WORKFLOW STATUS
//  PATCH /api/v1/workflows/:id/status
// ─────────────────────────────────────────────────────────────────────────────
export const updateWorkflowStatus = asyncHandler(async (req, res) => {
  const { status } = req.body

  const workflow = await updateWorkflowStatusService({
    workflowId: req.params.id,
    userId: req.user._id,
    status,
  })

  return res.status(200).json(
    new ApiResponse(200, `Workflow status updated to ${status}`, { workflow })
  )
})