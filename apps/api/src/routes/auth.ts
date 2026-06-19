import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users, organizations, organization_users } from '../db/schema';
import { signToken } from '../lib/jwt';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new AppError(400, 'Email and password are required');

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    const [orgUser] = await db
      .select({
        organization_id: organization_users.organization_id,
        organization_role: organization_users.organization_role,
      })
      .from(organization_users)
      .where(eq(organization_users.user_id, user.id))
      .limit(1);

    if (!orgUser) throw new AppError(403, 'User is not associated with any organization');

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgUser.organization_id))
      .limit(1);

    const token = signToken({
      userId: user.id,
      organizationId: orgUser.organization_id,
      role: user.role,
      orgRole: orgUser.organization_role,
    });

    return success(res, {
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      organization: org ? { id: org.id, name: org.name } : null,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (_req, res) => {
  return success(res, { message: 'Logged out' });
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, full_name: users.full_name, role: users.role })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user) throw new AppError(404, 'User not found');

    const [orgUser] = await db
      .select({
        organization_id: organization_users.organization_id,
        organization_role: organization_users.organization_role,
      })
      .from(organization_users)
      .where(eq(organization_users.user_id, user.id))
      .limit(1);

    const org = orgUser
      ? (
          await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, orgUser.organization_id))
            .limit(1)
        )[0]
      : null;

    return success(res, {
      user,
      organization: org ?? null,
      orgRole: orgUser?.organization_role ?? null,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
