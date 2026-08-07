import { Logger } from '../utils/logger';

const API_BASE = 'http://localhost:3000/api/v1';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  if (passed) {
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    console.error(`  ❌ [FAIL] ${name} -> Error: ${error}`);
    if (details) console.error('     Details:', JSON.stringify(details));
  }
}

async function runE2ETestSuite() {
  console.log(`=======================================================`);
  console.log(`🧪 STARTING AUTOMATED COMPREHENSIVE E2E INTEGRATION TEST`);
  console.log(`Target Base URL: ${API_BASE}`);
  console.log(`=======================================================\n`);

  let adminToken = '';
  let adminId = '';
  let clientToken = '';
  let clientId = '';
  let player2Token = '';
  let groundId = '';
  let testBookingId = '';

  // -------------------------------------------------------------
  // SUITE 1: AUTHENTICATION & PROFILES
  // -------------------------------------------------------------
  console.log(`📌 [SUITE 1] User Authentication & Profiles`);

  // Test 1.1: Admin Login
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_or_iin: '+77715269538', password: 'password123' }),
    });
    const data: any = await res.json();
    if (data.success && data.data.token && data.data.user.role === 'admin') {
      adminToken = data.data.token;
      adminId = data.data.user.id;
      recordTest('Admin Login (+77715269538)', true);
    } else {
      recordTest('Admin Login (+77715269538)', false, data.message || 'Login failed');
    }
  } catch (err: any) {
    recordTest('Admin Login (+77715269538)', false, err.message);
  }

  // Test 1.2: Client Login
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_or_iin: '+77771112233', password: 'password123' }),
    });
    const data: any = await res.json();
    if (data.success && data.data.token) {
      clientToken = data.data.token;
      clientId = data.data.user.id;
      recordTest('Client Login (Ерлан Спортивный)', true);
    } else {
      recordTest('Client Login (Ерлан Спортивный)', false, data.message);
    }
  } catch (err: any) {
    recordTest('Client Login (Ерлан Спортивный)', false, err.message);
  }

  // Test 1.3: Second Player Login
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_or_iin: '+77772223344', password: 'password123' }),
    });
    const data: any = await res.json();
    if (data.success && data.data.token) {
      player2Token = data.data.token;
      recordTest('Player 2 Login (Мария Волейбол)', true);
    } else {
      recordTest('Player 2 Login (Мария Волейбол)', false, data.message);
    }
  } catch (err: any) {
    recordTest('Player 2 Login (Мария Волейбол)', false, err.message);
  }

  // Test 1.4: Profile /auth/me Endpoint
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data: any = await res.json();
    if (data.success && data.data.id === adminId) {
      recordTest('GET /auth/me (Bearer Authentication)', true);
    } else {
      recordTest('GET /auth/me (Bearer Authentication)', false, data.message);
    }
  } catch (err: any) {
    recordTest('GET /auth/me (Bearer Authentication)', false, err.message);
  }

  // -------------------------------------------------------------
  // SUITE 2: GROUNDS & TIME OVERLAPPING / SCHOOL SCHEDULE
  // -------------------------------------------------------------
  console.log(`\n📌 [SUITE 2] Sports Grounds & Booking Slot Engine`);

  // Test 2.1: Fetch Sports Grounds
  try {
    const res = await fetch(`${API_BASE}/grounds`);
    const data: any = await res.json();
    if (data.success && data.data.length > 0) {
      groundId = data.data[0].id;
      recordTest(`Fetch Grounds List (Found ${data.data.length} grounds)`, true);
    } else {
      recordTest('Fetch Grounds List', false, 'No grounds found');
    }
  } catch (err: any) {
    recordTest('Fetch Grounds List', false, err.message);
  }

  // Test 2.2: School Hours Lockout Check (08:00 - 15:00 on school court)
  try {
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
    const mondayStr = nextMonday.toISOString().split('T')[0];

    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ground_id: groundId,
        booking_date: mondayStr,
        start_time: '10:00',
        end_time: '12:00',
      }),
    });
    const data: any = await res.json();
    if (!data.success && (data.message.includes('физкультуры') || data.message.includes('зарезервирована'))) {
      recordTest('School Schedule Lockout Enforcement (08:00 - 15:00)', true);
    } else {
      recordTest('School Schedule Lockout Enforcement (08:00 - 15:00)', false, 'Failed to block school hours booking', data);
    }
  } catch (err: any) {
    recordTest('School Schedule Lockout Enforcement (08:00 - 15:00)', false, err.message);
  }

  // Test 2.3: Valid Booking Creation (18:00 - 20:00)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ground_id: groundId,
        booking_date: tomorrowStr,
        start_time: '18:00',
        end_time: '20:00',
      }),
    });
    const data: any = await res.json();
    if (data.success && data.data.id) {
      testBookingId = data.data.id;
      recordTest(`Valid Booking Creation (${tomorrowStr} 18:00-20:00)`, true);
    } else {
      recordTest(`Valid Booking Creation (${tomorrowStr} 18:00-20:00)`, false, data.message);
    }
  } catch (err: any) {
    recordTest('Valid Booking Creation', false, err.message);
  }

  // Test 2.4: Overlapping Booking Prevention (User Overlapping)
  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({
        ground_id: groundId,
        booking_date: tomorrowStr,
        start_time: '19:00',
        end_time: '21:00',
      }),
    });
    const data: any = await res.json();
    if (!data.success && data.message.includes('уже забронирован')) {
      recordTest('Overlapping Booking Conflict Prevention', true);
    } else {
      recordTest('Overlapping Booking Conflict Prevention', false, 'Failed to reject overlapping slot', data);
    }
  } catch (err: any) {
    recordTest('Overlapping Booking Conflict Prevention', false, err.message);
  }

  // -------------------------------------------------------------
  // SUITE 3: MATCHMAKING & AUTOMATED APPROVAL
  // -------------------------------------------------------------
  console.log(`\n📌 [SUITE 3] Matchmaking Feed & Automated Player Approval`);

  // Test 3.1: Enable Matchmaking & Auto-Approve on Booking
  try {
    const res = await fetch(`${API_BASE}/bookings/${testBookingId}/matchmaking-settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        is_looking_for_players: true,
        needed_players_count: 4,
        auto_approve_players: true,
      }),
    });
    const data: any = await res.json();
    if (data.success && data.data.is_looking_for_players && data.data.auto_approve_players) {
      recordTest('Enable Matchmaking Settings (auto_approve = true)', true);
    } else {
      recordTest('Enable Matchmaking Settings', false, data.message);
    }
  } catch (err: any) {
    recordTest('Enable Matchmaking Settings', false, err.message);
  }

  // Test 3.2: Fetch Open Matchmaking Feed
  try {
    const res = await fetch(`${API_BASE}/bookings/open-matchmaking`);
    const data: any = await res.json();
    if (data.success && data.data.length > 0) {
      recordTest(`Fetch Open Matchmaking Feed (Matches found: ${data.data.length})`, true);
    } else {
      recordTest('Fetch Open Matchmaking Feed', false, 'No open matches returned');
    }
  } catch (err: any) {
    recordTest('Fetch Open Matchmaking Feed', false, err.message);
  }

  // Test 3.3: Player Request to Join Slot (Auto-Approved)
  try {
    const res = await fetch(`${API_BASE}/bookings/${testBookingId}/request-join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
    });
    const data: any = await res.json();
    if (data.success && data.message.includes('одобрена')) {
      recordTest('Join Slot Request (⚡ Auto-Approve Instant Entry)', true);
    } else {
      recordTest('Join Slot Request (⚡ Auto-Approve Instant Entry)', false, data.message);
    }
  } catch (err: any) {
    recordTest('Join Slot Request', false, err.message);
  }

  // -------------------------------------------------------------
  // SUITE 4: TTLOCK SERVICE (MOCK VS LIVE) & DOOR UNLOCK
  // -------------------------------------------------------------
  console.log(`\n📌 [SUITE 4] TTLock Access Control (Mock vs Live)`);

  let todayBookingId = '';
  const todayStr = new Date().toISOString().split('T')[0];

  // Create an active booking for TODAY covering current time (15:00 - 23:00 is outside 08:00-15:00 school hours)
  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ground_id: groundId,
        booking_date: todayStr,
        start_time: '15:00',
        end_time: '23:00',
      }),
    });
    const data: any = await res.json();
    if (data.success && data.data.id) {
      todayBookingId = data.data.id;
    }
  } catch (err: any) {}

  const unlockTargetBookingId = todayBookingId || testBookingId;

  // Test 4.1: Switch TTLock Mode to MOCK
  try {
    const res = await fetch(`${API_BASE}/admin/ttlock-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'mock' }),
    });
    const data: any = await res.json();
    if (data.success && data.data.mode === 'mock') {
      recordTest('Switch TTLock Mode -> MOCK', true);
    } else {
      recordTest('Switch TTLock Mode -> MOCK', false, data.message);
    }
  } catch (err: any) {
    recordTest('Switch TTLock Mode -> MOCK', false, err.message);
  }

  // Test 4.2: Door Unlock in MOCK Mode
  try {
    const res = await fetch(`${API_BASE}/locks/unlock-button`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ booking_id: unlockTargetBookingId }),
    });
    const data: any = await res.json();
    if (data.success && data.doorUnlocked && data.data.mode === 'mock_online_unlock') {
      recordTest('Door Unlock in MOCK Mode (mock_online_unlock)', true);
    } else {
      recordTest('Door Unlock in MOCK Mode', false, data.message, data);
    }
  } catch (err: any) {
    recordTest('Door Unlock in MOCK Mode', false, err.message);
  }

  // Test 4.3: Switch TTLock Mode to LIVE & Test Fallback
  try {
    await fetch(`${API_BASE}/admin/ttlock-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'real' }),
    });

    const res = await fetch(`${API_BASE}/locks/unlock-button`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ booking_id: unlockTargetBookingId }),
    });
    const data: any = await res.json();
    if (data.success && data.doorUnlocked && data.data.mode === 'offline_passcode') {
      recordTest('Door Unlock in LIVE Mode (Failover -> offline_passcode)', true);
    } else {
      recordTest('Door Unlock in LIVE Mode', false, data.message, data);
    }

    // Switch back to MOCK for safety
    await fetch(`${API_BASE}/admin/ttlock-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'mock' }),
    });
  } catch (err: any) {
    recordTest('Door Unlock in LIVE Mode', false, err.message);
  }

  // Cleanup today booking if created
  if (todayBookingId) {
    try {
      await fetch(`${API_BASE}/bookings/${todayBookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // SUITE 5: USER BANS & AMNESTY MODULE
  // -------------------------------------------------------------
  console.log(`\n📌 [SUITE 5] User Ban & Amnesty Module`);

  // Test 5.1: Ban User
  try {
    const res = await fetch(`${API_BASE}/admin/users/${clientId}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ duration: '24h', reason: 'Test E2E Ban' }),
    });
    const data: any = await res.json();
    if (data.success && data.data.user.is_banned) {
      recordTest('Admin Ban User (+77771112233)', true);
    } else {
      recordTest('Admin Ban User (+77771112233)', false, data.message);
    }
  } catch (err: any) {
    recordTest('Admin Ban User', false, err.message);
  }

  // Test 5.2: Banned User Login Rejection
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_or_iin: '+77771112233', password: 'password123' }),
    });
    const data: any = await res.json();
    if (!data.success && data.message.includes('заблокирован')) {
      recordTest('Banned User Login Rejection', true);
    } else {
      recordTest('Banned User Login Rejection', false, 'Failed to block banned user login', data);
    }
  } catch (err: any) {
    recordTest('Banned User Login Rejection', false, err.message);
  }

  // Test 5.3: Unban User (Amnesty)
  try {
    const res = await fetch(`${API_BASE}/admin/users/${clientId}/unban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data: any = await res.json();
    if (data.success && !data.data.is_banned) {
      recordTest('Admin Unban User (Amnesty)', true);
    } else {
      recordTest('Admin Unban User (Amnesty)', false, data.message);
    }
  } catch (err: any) {
    recordTest('Admin Unban User', false, err.message);
  }

  // -------------------------------------------------------------
  // SUITE 6: AKIMAT ANALYTICS & METRICS DASHBOARD
  // -------------------------------------------------------------
  console.log(`\n📌 [SUITE 6] Akimat Analytics & Executive Dashboard`);

  // Test 6.1: Akimat Analytics Endpoint
  try {
    const res = await fetch(`${API_BASE}/analytics/akimat`);
    const data: any = await res.json();
    if (data.success && data.data.kpi && data.data.hourlyProfile.length === 15) {
      recordTest(`GET /analytics/akimat (KPI Citizens: ${data.data.kpi.totalCitizensCount}, Hourly Slots: ${data.data.hourlyProfile.length})`, true);
    } else {
      recordTest('GET /analytics/akimat', false, data.message);
    }
  } catch (err: any) {
    recordTest('GET /analytics/akimat', false, err.message);
  }

  // Test 6.2: Admin Analytics Overview
  try {
    const res = await fetch(`${API_BASE}/admin/analytics/overview`);
    const data: any = await res.json();
    if (data.success && data.data.occupancyPercentage !== undefined) {
      recordTest('GET /admin/analytics/overview', true);
    } else {
      recordTest('GET /admin/analytics/overview', false, data.message);
    }
  } catch (err: any) {
    recordTest('GET /admin/analytics/overview', false, err.message);
  }

  // Test 6.3: Venue Hourly Heatmap
  try {
    const res = await fetch(`${API_BASE}/admin/analytics/venues/${groundId}/heatmap`);
    const data: any = await res.json();
    if (data.success && data.data.hourlyMatrix.length > 0) {
      recordTest('GET /admin/analytics/venues/:id/heatmap', true);
    } else {
      recordTest('GET /admin/analytics/venues/:id/heatmap', false, data.message);
    }
  } catch (err: any) {
    recordTest('GET /admin/analytics/venues/:id/heatmap', false, err.message);
  }

  // -------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------
  if (testBookingId) {
    try {
      await fetch(`${API_BASE}/bookings/${testBookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // TEST SUMMARY REPORT
  // -------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log(`\n=======================================================`);
  console.log(`📊 COMPREHENSIVE E2E TEST SUMMARY REPORT`);
  console.log(`=======================================================`);
  console.log(`✅ Passed: ${passedCount} / ${results.length}`);
  console.log(`❌ Failed: ${failedCount} / ${results.length}`);
  console.log(`=======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runE2ETestSuite();
