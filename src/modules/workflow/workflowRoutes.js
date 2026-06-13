import { Router } from 'express'
import {
  createWorkflow,
  getAllWorkflows,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  updateWorkflowStatus,
} from './workflowController.js'
import {
  createWorkflowValidator,
  updateWorkflowValidator,
  workflowIdValidator,
  updateStatusValidator,
} from './workflowValidator.js'
import validate from '../../middlewares/validate.middleware.js'
import authMiddleware from '../../middlewares/authMiddlewares.js'

const router = Router()

// ─── All routes protected — JWT required ─────────────────────────────────────
router.use(authMiddleware)

// ─── Routes ──────────────────────────────────────────────────────────────────
router.post('/', createWorkflowValidator, validate, createWorkflow)
router.get('/', getAllWorkflows)
router.get('/:id', workflowIdValidator, validate, getWorkflow)
router.put('/:id', updateWorkflowValidator, validate, updateWorkflow)
router.delete('/:id', workflowIdValidator, validate, deleteWorkflow)
router.patch('/:id/status', updateStatusValidator, validate, updateWorkflowStatus)

export default router