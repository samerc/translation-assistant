import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Permission } from '../modules/roles/entities/permission.entity.js';
import { Role } from '../modules/roles/entities/role.entity.js';
import { User } from '../modules/users/entities/user.entity.js';

const RESOURCES = [
  'users',
  'roles',
  'clients',
  'jobs',
  'templates',
  'documents',
  'invoices',
  'settings',
  'reports',
  'calendar',
  'notifications',
  'files',
];

const ACTIONS = ['create', 'read', 'update', 'delete'];

export async function seed(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);

  // Create permissions
  const existingPermissions = await permissionRepo.count();
  if (existingPermissions === 0) {
    const permissions: Partial<Permission>[] = [];
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        permissions.push({
          resource,
          action,
          description: `${action} ${resource}`,
        });
      }
    }
    await permissionRepo.save(permissions);
    console.log(`Seeded ${permissions.length} permissions`);
  }

  // Create Admin role with all permissions
  const existingRoles = await roleRepo.count();
  if (existingRoles === 0) {
    const allPermissions = await permissionRepo.find();

    const adminRole = roleRepo.create({
      name: 'Admin',
      description: 'Full access to all features',
      permissions: allPermissions,
    });
    await roleRepo.save(adminRole);

    const translatorRole = roleRepo.create({
      name: 'Translator',
      description: 'Can manage jobs, documents, and clients',
      permissions: allPermissions.filter((p) =>
        ['clients', 'jobs', 'documents', 'templates', 'files', 'calendar', 'notifications'].includes(p.resource) &&
        ['create', 'read', 'update'].includes(p.action),
      ),
    });
    await roleRepo.save(translatorRole);

    const viewerRole = roleRepo.create({
      name: 'Viewer',
      description: 'Read-only access',
      permissions: allPermissions.filter((p) => p.action === 'read'),
    });
    await roleRepo.save(viewerRole);

    console.log('Seeded roles: Admin, Translator, Viewer');
  }

  // Create default admin user
  const existingUsers = await userRepo.count();
  if (existingUsers === 0) {
    const adminRole = await roleRepo.findOne({ where: { name: 'Admin' } });
    if (adminRole) {
      const hashedPassword = await bcrypt.hash('admin123!', 12);
      const admin = userRepo.create({
        email: 'admin@translation-assistant.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        roleId: adminRole.id,
        isActive: true,
      });
      await userRepo.save(admin);
      console.log('Seeded admin user: admin@translation-assistant.com / admin123!');
    }
  }
}
