import { Router } from 'express';
import * as sessionController from '../controllers/sessionController';
import { protect, requireVerified } from '../middleware/auth';
import { validateSessionTitle } from '../middleware/validation'; // Create if needed

const router = Router();

router.use(protect as any);
router.use(requireVerified as any);

// Owner/editor
router.post('/', validateSessionTitle as any, sessionController.createSession as any);
router.get('/', sessionController.getUserSessions as any);

// Protected
router.get('/:id', sessionController.getSession as any);
router.post('/:id/join', sessionController.joinSession as any);
router.post('/:id/invite', sessionController.generateInvite as any);
router.post('/:id/invite/send', sessionController.sendInviteEmail as any);
router.post('/:id/role', sessionController.changeRole as any);
router.post('/:id/archive', sessionController.archiveSession as any);

export default router;

