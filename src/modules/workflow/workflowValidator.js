import { body, param } from 'express-validator'
import { backendBindings } from '../../registry/bindings.js'

export const createWorkflowValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Workflow name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
]

export const updateWorkflowValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid workflow ID'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('nodes')
    .optional()
    .isArray()
    .withMessage('Nodes must be an array')
    .custom((nodes) => {
      if (nodes.length > 50) {
        throw new Error('Workflow cannot have more than 50 nodes')
      }
      return true
    }),

  body('edges')
    .optional()
    .isArray()
    .withMessage('Edges must be an array')
    .custom((edges) => {
      if (edges.length > 100) {
        throw new Error('Workflow cannot have more than 100 edges')
      }
      return true
    }),

  body('nodes.*.id')
    .if(body('nodes').exists())
    .notEmpty()
    .withMessage('Each node must have an id'),

  body('nodes.*.type')
    .if(body('nodes').exists())
    .isIn(backendBindings.getValidSchemaTypeIds())
    .withMessage('Invalid node type'),

  body('nodes.*.position.x')
    .if(body('nodes').exists())
    .isNumeric()
    .withMessage('Node position x must be a number'),

  body('nodes.*.position.y')
    .if(body('nodes').exists())
    .isNumeric()
    .withMessage('Node position y must be a number'),

  body('edges.*.id')
    .if(body('edges').exists())
    .notEmpty()
    .withMessage('Each edge must have an id'),

  body('edges.*.source')
    .if(body('edges').exists())
    .notEmpty()
    .withMessage('Each edge must have a source'),

  body('edges.*.target')
    .if(body('edges').exists())
    .notEmpty()
    .withMessage('Each edge must have a target'),
]

export const workflowIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid workflow ID'),
]

export const updateStatusValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid workflow ID'),

  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['draft', 'active', 'paused'])
    .withMessage('Status must be draft, active or paused'),
]

export const executeWorkflowValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid workflow ID'),

  body('triggerData.name')
    .trim()
    .notEmpty()
    .withMessage('New developer name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),

  body('triggerData.email')
    .trim()
    .notEmpty()
    .withMessage('New developer email is required')
    .isEmail()
    .withMessage('Email must be a valid email address'),

  body('triggerData.githubUsername')
    .optional()
    .trim()
    .isLength({ max: 39 })
    .withMessage('GitHub username cannot exceed 39 characters'),
]