import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { GroundsController } from '../controllers/groundsController';
import { BookingsController } from '../controllers/bookingsController';
import { LocksController } from '../controllers/locksController';
import { AdminController } from '../controllers/adminController';
import { authenticateJwt, requireAdmin } from '../middlewares/authMiddleware';
import { validateIIN } from '../utils/iinValidator';

const router = Router();

// --- Auth Routes ---
router.post('/auth/register', AuthController.register as any);
router.post('/auth/login', AuthController.login as any);
router.get('/auth/me', authenticateJwt, AuthController.getMe as any);

// --- IIN Validation Utility Endpoint ---
router.post('/iin/validate', (req, res) => {
  const { iin } = req.body;
  const result = validateIIN(iin);
  return res.json({ success: result.isValid, data: result });
});

// --- Sports Grounds Routes ---
router.get('/grounds', GroundsController.getAllGrounds as any);
router.post('/grounds', authenticateJwt, requireAdmin, GroundsController.createGround as any);
router.get('/grounds/qr/:qr_code_token', GroundsController.getGroundByQrToken as any);

// --- Bookings & Slot Management Routes ---
router.post('/bookings', authenticateJwt, BookingsController.createBooking as any);
router.get('/bookings/my', authenticateJwt, BookingsController.getMyBookings as any);
router.post('/bookings/:id/invite-link', authenticateJwt, BookingsController.getInviteLink as any);
router.get('/invitations/:token', BookingsController.getInvitationByToken as any);
router.post('/invitations/:token/accept', authenticateJwt, BookingsController.acceptInvitation as any);

// --- Dynamic QR & Spontaneous Check-in ---
router.post('/grounds/qr-check-in', authenticateJwt, BookingsController.spontaneousQrCheckIn as any);

// --- Hybrid Door Entry Access Control (TTLock) ---
router.post('/locks/unlock-button', authenticateJwt, LocksController.unlockByAppButton as any);
router.post('/locks/unlock-qr', authenticateJwt, LocksController.unlockByDoorQr as any);

// --- Admin & Gateway Health Monitoring Routes ---
router.get('/admin/gateways', AdminController.getGatewayStatus as any);
router.post('/admin/gateways/toggle', AdminController.toggleGatewayStatus as any);
router.get('/admin/lock-logs', AdminController.getLockLogs as any);
router.get('/admin/stats', AdminController.getSystemStats as any);

export default router;
