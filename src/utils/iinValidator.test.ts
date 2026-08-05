import { validateIIN } from './iinValidator';

function runTests() {
  console.log('🧪 Running IIN Validator Unit Tests...\n');

  const testCases = [
    {
      name: 'Valid Male born 1995-05-15 (20th Century)',
      iin: '950515350124',
      expectedValid: true,
      expectedGender: 'male',
      expectedYear: 1995,
      expectedMonth: 4, // 0-indexed May
      expectedDay: 15,
    },
    {
      name: 'User Real RK IIN (890918350184)',
      iin: '890918350184',
      expectedValid: true,
      expectedGender: 'male',
      expectedYear: 1989,
      expectedMonth: 8, // 0-indexed September
      expectedDay: 18,
    },
    {
      name: 'Valid Female born 2002-08-10 (21st Century)',
      iin: '020810600358',
      expectedValid: true,
      expectedGender: 'female',
      expectedYear: 2002,
      expectedMonth: 7, // 0-indexed August
      expectedDay: 10,
    },
    {
      name: 'Invalid Length (11 digits)',
      iin: '95051535012',
      expectedValid: false,
    },
    {
      name: 'Invalid Date (Feb 30th)',
      iin: '950230350124',
      expectedValid: false,
    },
    {
      name: 'Invalid Century/Gender (7th digit = 9)',
      iin: '950515950124',
      expectedValid: false,
    },
    {
      name: 'Invalid Check Digit but valid 12-digit date (non-blocking)',
      iin: '950515350129',
      expectedValid: true,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const res = validateIIN(tc.iin);
    if (res.isValid === tc.expectedValid) {
      if (tc.expectedValid && res.birthDate && tc.expectedYear !== undefined) {
        const matchesYear = res.birthDate.getUTCFullYear() === tc.expectedYear;
        const matchesMonth = res.birthDate.getUTCMonth() === tc.expectedMonth;
        const matchesDay = res.birthDate.getUTCDate() === tc.expectedDay;
        const matchesGender = res.gender === tc.expectedGender;

        if (matchesYear && matchesMonth && matchesDay && matchesGender) {
          console.log(`✅ [PASS] ${tc.name}`);
          passed++;
        } else {
          console.error(`❌ [FAIL] ${tc.name} - Extracted metadata mismatch`, res);
          failed++;
        }
      } else {
        console.log(`✅ [PASS] ${tc.name}`);
        passed++;
      }
    } else {
      console.error(`❌ [FAIL] ${tc.name} - Expected valid=${tc.expectedValid}, got=${res.isValid} (${res.error})`);
      failed++;
    }
  }

  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed out of ${testCases.length} tests.`);
  if (failed > 0) process.exit(1);
}

runTests();
