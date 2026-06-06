import { body } from 'express-validator'

export const registerValidator = [
  // ── Name check ──────────────────────────
  body('name')
    .trim()                          
    .notEmpty()                      
    .withMessage('Name is required') 
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),

  // ── Email check ──────────────────────────
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()                        
    .withMessage('Please provide a valid email')
    .normalizeEmail(),               

  // ── Password check ───────────────────────
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and a number'),
]


export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
]