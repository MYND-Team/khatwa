/**
 * One-time fix script: Ensure sameryasser-khatwa is always ADMIN role.
 * Run with: npm --prefix backend run fix:admin-role
 *
 * This script finds any user with the admin username and forces their role to ADMIN.
 * It also force-resets the password to the canonical admin password.
 */

import { prisma } from '../src/config/prisma';
import bcrypt from 'bcryptjs';

const ADMIN_USERNAME = 'sameryasser-khatwa';
const ADMIN_PASSWORD = 'Samer-yasser159';

async function main() {
  console.log('🔧 Fixing admin account role...');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Upsert: create if not exists, or update role to ADMIN if it was downgraded
  const user = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: {
      username: ADMIN_USERNAME,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
    update: {
      role: 'ADMIN',
      isActive: true,
      passwordHash,
    },
    select: { id: true, username: true, role: true, isActive: true },
  });

  console.log(`✅ Admin account fixed:`, user);

  // Revoke all active refresh tokens for this user so next login gets ADMIN token
  const revoked = await prisma.refreshToken.updateMany({
    where: { userId: user.id, revoked: false },
    data: { revoked: true },
  });

  if (revoked.count > 0) {
    console.log(`🔄 Revoked ${revoked.count} stale session token(s) — admin must log in again.`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Fix failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
