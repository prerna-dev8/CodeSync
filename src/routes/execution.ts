import { Router } from 'express';
import * as executionController from '../controllers/executionController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/run', protect as any, executionController.runExecution);
router.post('/:sessionId/stop/:executionId', protect as any, executionController.stopExecution);
router.get('/:sessionId/executions', protect as any, executionController.getSessionExecutions);
router.get('/:sessionId/active', protect, executionController.getActiveExecution);

export { router };

