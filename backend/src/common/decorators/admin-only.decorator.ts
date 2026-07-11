import { SetMetadata } from '@nestjs/common';
import { ADMIN_ONLY_KEY } from '../guards/admin.guard.js';

/**
 * Marks a controller or method as admin-only.
 * Requires the AdminGuard to be registered (globally or on the controller).
 * The guard checks user.role.name === 'Admin' from the database — not just permissions.
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
