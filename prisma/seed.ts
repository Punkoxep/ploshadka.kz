import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validateIIN } from '../src/utils/iinValidator';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Clean Database Seeding for School #11 Grounds...');

  // Clean existing tables for fresh seed
  await prisma.lockLog.deleteMany();
  await prisma.bookingGuest.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.gatewayStatusLog.deleteMany();
  await prisma.gateway.deleteMany();
  await prisma.ground.deleteMany();
  await prisma.user.deleteMany();

  // Password for all seed users: "password123"
  const password_hash = await bcrypt.hash('password123', 10);

  // 1. Create Main Owner & Admin: Ивкин Антон Витальевич
  const ownerIIN = '890918350184'; // 1989-09-18, male
  const ownerIINRes = validateIIN(ownerIIN);
  const ownerUser = await prisma.user.create({
    data: {
      iin: ownerIIN,
      phone_number: '+77715269538',
      full_name: 'Ивкин Антон Витальевич (Владелец & Admin)',
      birth_date: ownerIINRes.birthDate || new Date('1989-09-18'),
      gender: ownerIINRes.gender || 'male',
      role: 'admin',
      password_hash,
    },
  });
  console.log('👑 Main Owner & Admin created:', ownerUser.full_name, `(ИИН: ${ownerUser.iin})`);

  // 2. Create Guest Client User 1 (Invited friend)
  const guest1IIN = '010320500248'; // 2001-03-20, male
  const guest1Res = validateIIN(guest1IIN);
  const guestUser1 = await prisma.user.create({
    data: {
      iin: guest1IIN,
      phone_number: '+77778889900',
      full_name: 'Азамат Другов (Приглашенный игрок)',
      birth_date: guest1Res.birthDate || new Date('2001-03-20'),
      gender: guest1Res.gender || 'male',
      role: 'client',
      password_hash,
    },
  });
  console.log('✅ Guest 1 created:', guestUser1.full_name);

  // 3. Create Guest Client User 2 (Spontaneous QR)
  const guest2IIN = '020810600358'; // 2002-08-10, female
  const guest2Res = validateIIN(guest2IIN);
  const guestUser2 = await prisma.user.create({
    data: {
      iin: guest2IIN,
      phone_number: '+77471234567',
      full_name: 'Диана Спонтанная (Гость по QR)',
      birth_date: guest2Res.birthDate || new Date('2002-08-10'),
      gender: guest2Res.gender || 'female',
      role: 'client',
      password_hash,
    },
  });
  console.log('✅ Guest 2 created:', guestUser2.full_name);

  // 4. Create New Test Player 1: Ерлан Спортивный
  const erlanIIN = '950101300111';
  const erlanRes = validateIIN(erlanIIN);
  const erlanUser = await prisma.user.create({
    data: {
      iin: erlanIIN,
      phone_number: '+77771112233',
      full_name: 'Ерлан Спортивный',
      birth_date: erlanRes.birthDate || new Date('1995-01-01'),
      gender: erlanRes.gender || 'male',
      role: 'client',
      password_hash,
    },
  });
  console.log('✅ Test Player 1 created:', erlanUser.full_name);

  // 5. Create New Test Player 2: Мария Волейбол
  const mariaIIN = '980515400222';
  const mariaRes = validateIIN(mariaIIN);
  const mariaUser = await prisma.user.create({
    data: {
      iin: mariaIIN,
      phone_number: '+77772223344',
      full_name: 'Мария Волейбол',
      birth_date: mariaRes.birthDate || new Date('1998-05-15'),
      gender: mariaRes.gender || 'female',
      role: 'client',
      password_hash,
    },
  });
  console.log('✅ Test Player 2 created:', mariaUser.full_name);

  // 6. Create New Test Player 3: Берик Нападающий
  const berikIIN = '010920500333';
  const berikRes = validateIIN(berikIIN);
  const berikUser = await prisma.user.create({
    data: {
      iin: berikIIN,
      phone_number: '+77773334455',
      full_name: 'Берик Нападающий',
      birth_date: berikRes.birthDate || new Date('2001-09-20'),
      gender: berikRes.gender || 'male',
      role: 'client',
      password_hash,
    },
  });
  console.log('✅ Test Player 3 created:', berikUser.full_name);

  // 4. Create Sports Grounds for School #11
  const footballGround = await prisma.ground.create({
    data: {
      name: 'Спортивная площадка Школа №11 (Футбольное поле)',
      type: 'football',
      address: 'Школа №11',
      operating_schedule: '08:00 - 23:00',
      cost_per_hour: 10000,
      qr_code_token: 'QR_SCHOOL11_FOOTBALL',
      ttlock_lock_id: 'LOCK_SCHOOL11_FOOTBALL_101',
      ttlock_mac_address: 'AA:BB:CC:DD:11:01',
    },
  });

  const basketballGround = await prisma.ground.create({
    data: {
      name: 'Спортивная площадка Школа №11 (Баскетбольная площадка)',
      type: 'basketball',
      address: 'Школа №11',
      operating_schedule: '08:00 - 23:00',
      cost_per_hour: 8000,
      qr_code_token: 'QR_SCHOOL11_BASKETBALL',
      ttlock_lock_id: 'LOCK_SCHOOL11_BASKETBALL_102',
      ttlock_mac_address: 'AA:BB:CC:DD:11:02',
    },
  });

  console.log('✅ Sports Grounds created for School #11 (Football & Basketball)');

  // 5. Create Wi-Fi Gateways for School #11
  await prisma.gateway.create({
    data: {
      ground_id: footballGround.id,
      gateway_name: 'TTLock Gateway #1 (Школа №11 - Футбол)',
      ttlock_gateway_id: 'GW_SCHOOL11_FOOTBALL_01',
      status: 'online',
    },
  });

  await prisma.gateway.create({
    data: {
      ground_id: basketballGround.id,
      gateway_name: 'TTLock Gateway #2 (Школа №11 - Баскетбол)',
      ttlock_gateway_id: 'GW_SCHOOL11_BASKETBALL_02',
      status: 'online',
    },
  });

  console.log('✅ TTLock Wi-Fi Gateways created for School #11');

  // 6. Create Active Booking Hosted by Ивкин Антон Витальевич on Football Field #11
  const now = new Date();
  const currentDateStr = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  const startHourStr = String(currentHour).padStart(2, '0') + ':00';
  const endHourStr = String((currentHour + 2) % 24).padStart(2, '0') + ':00';

  const booking = await prisma.booking.create({
    data: {
      ground_id: footballGround.id,
      host_user_id: ownerUser.id,
      booking_date: currentDateStr,
      start_time: startHourStr,
      end_time: endHourStr,
      total_price: 20000,
      status: 'confirmed',
      payment_status: 'paid',
      invite_token: 'INVITE_SCHOOL11_FOOTBALL_123',
    },
  });

  // Add guestUser1 as invited approved guest
  await prisma.bookingGuest.create({
    data: {
      booking_id: booking.id,
      user_id: guestUser1.id,
      type: 'invited',
      status: 'approved',
    },
  });

  console.log(`✅ Active Booking created on School #11 Football field hosted by Ивкин Антон Витальевич (${currentDateStr} ${startHourStr} - ${endHourStr})!`);
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
