import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Permission } from '../modules/roles/entities/permission.entity.js';
import { Role } from '../modules/roles/entities/role.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { LabelOption } from '../modules/settings/entities/label-option.entity.js';

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

  // Seed default label options
  const labelRepo = dataSource.getRepository(LabelOption);
  const existingLabels = await labelRepo.count();
  if (existingLabels === 0) {
    const defaults = [
      { category: 'email', value: 'Work', sortOrder: 1 },
      { category: 'email', value: 'Personal', sortOrder: 2 },
      { category: 'email', value: 'Other', sortOrder: 3 },
      { category: 'phone', value: 'Work', sortOrder: 1 },
      { category: 'phone', value: 'Mobile', sortOrder: 2 },
      { category: 'phone', value: 'Home', sortOrder: 3 },
      { category: 'phone', value: 'Fax', sortOrder: 4 },
      { category: 'phone', value: 'Other', sortOrder: 5 },
      { category: 'address', value: 'Work', sortOrder: 1 },
      { category: 'address', value: 'Home', sortOrder: 2 },
      { category: 'address', value: 'Billing', sortOrder: 3 },
      { category: 'address', value: 'Shipping', sortOrder: 4 },
      { category: 'address', value: 'Other', sortOrder: 5 },
    ];
    await labelRepo.save(defaults);
    console.log('Seeded default label options');
  }
}
