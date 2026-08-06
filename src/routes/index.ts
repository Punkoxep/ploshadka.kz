import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { GroundsController } from '../controllers/groundsController';
import { BookingsController } from '../controllers/bookingsController';
import { LocksController } from '../controllers/locksController';
import { TTLockController } from '../controllers/ttlockController';
import { AdminController } from '../controllers/adminController';
import { authenticateJwt, requireAdmin } from '../middlewares/authMiddleware';
import { validateIIN } from '../utils/iinValidator';

const router = Router();

// --- Auth & User Registration Routes ---
router.post('/auth/register', AuthController.register as any);
router.post('/users/register', AuthController.register as any);
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
router.put('/grounds/:id', GroundsController.updateGround as any);
router.put('/courts/:id', GroundsController.updateGround as any);
router.get('/grounds/qr/:qr_code_token', GroundsController.getGroundByQrToken as any);

// --- Bookings & Slot Management Routes ---
router.get('/bookings/all', BookingsController.getAllBookings as any);
router.get('/bookings/open-matchmaking', BookingsController.getOpenMatchmakingBookings as any);
router.post('/bookings', authenticateJwt, BookingsController.createBooking as any);
router.patch('/bookings/:id/matchmaking-settings', authenticateJwt, BookingsController.updateMatchmakingSettings as any);
router.get('/bookings/my', authenticateJwt, BookingsController.getMyBookings as any);
router.post('/bookings/:id/cancel', authenticateJwt, BookingsController.cancelBooking as any);
router.delete('/bookings/:bookingId/guests/:guestId', authenticateJwt, BookingsController.removeGuest as any);
router.post('/bookings/:id/invite-link', authenticateJwt, BookingsController.getInviteLink as any);
router.get('/invitations/:token', BookingsController.getInvitationByToken as any);
router.post('/invitations/:token/accept', authenticateJwt, BookingsController.acceptInvitation as any);

// --- Slot Join Requests Routes ---
router.get('/bookings/requests', authenticateJwt, BookingsController.getHostIncomingRequests as any);
router.post('/bookings/:id/request-join', authenticateJwt, BookingsController.requestJoinSlot as any);
router.get('/bookings/:id/requests', authenticateJwt, BookingsController.getBookingJoinRequests as any);
router.post('/bookings/requests/:requestId/respond', authenticateJwt, BookingsController.respondJoinRequest as any);
router.post('/bookings/:id/requests/:requestId/approve', authenticateJwt, (req: any, res: any, next: any) => { req.body.status = 'APPROVED'; return (BookingsController.respondJoinRequest as any)(req, res, next); });
router.post('/bookings/requests/:requestId/approve', authenticateJwt, (req: any, res: any, next: any) => { req.body.status = 'APPROVED'; return (BookingsController.respondJoinRequest as any)(req, res, next); });

// --- Dynamic QR & Spontaneous Check-in ---
router.post('/bookings/spontaneous-join', authenticateJwt, BookingsController.spontaneousQrCheckIn as any);
router.post('/grounds/qr-check-in', authenticateJwt, BookingsController.spontaneousQrCheckIn as any);

// --- Hybrid Door Entry Access Control (TTLock) ---
router.post('/ttlock/callback', TTLockController.handleCallback as any);
router.post('/locks/unlock', authenticateJwt, LocksController.unlockByAppButton as any);
router.post('/locks/unlock-button', authenticateJwt, LocksController.unlockByAppButton as any);
router.post('/locks/unlock-qr', authenticateJwt, LocksController.unlockByDoorQr as any);
router.get('/locks/active-access', authenticateJwt, LocksController.getActiveAccess as any);

// --- Admin & Gateway Health Monitoring Routes ---
router.get('/admin/gateways', AdminController.getGatewayStatus as any);
router.post('/admin/gateways/toggle', AdminController.toggleGatewayStatus as any);
router.get('/admin/lock-logs', AdminController.getLockLogs as any);
router.get('/admin/stats', AdminController.getSystemStats as any);

// --- Admin Analytics & Metrics Routes ---
router.get('/analytics/akimat', AdminController.getAkimatAnalytics as any);
router.get('/admin/analytics/akimat', AdminController.getAkimatAnalytics as any);
router.get('/admin/analytics/overview', AdminController.getAnalyticsOverview as any);
router.get('/admin/analytics/venues/:venueId/heatmap', AdminController.getVenueHeatmap as any);
router.get('/admin/analytics/venues/:venueId/players', AdminController.getVenuePlayersAnalytics as any);
router.post('/admin/grounds', GroundsController.createGround as any);
router.put('/admin/grounds/:id', GroundsController.updateGround as any);
router.post('/admin/bookings/check-noshows', BookingsController.checkNoShows as any);
router.get('/admin/bans', AdminController.getBansList as any);
router.get('/admin/users', AdminController.getUsersList as any);
router.post('/admin/users/:userId/ban', AdminController.banUser as any);
router.post('/admin/users/:userId/unban', AdminController.unbanUser as any);

export default router;
