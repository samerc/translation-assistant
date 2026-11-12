import { DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Permission } from '../modules/roles/entities/permission.entity.js';
import { Role } from '../modules/roles/entities/role.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { LabelOption } from '../modules/settings/entities/label-option.entity.js';
import { Language } from '../modules/settings/entities/language.entity.js';
import { AppSettings } from '../modules/settings/entities/app-settings.entity.js';
import {
  ROLE_ADMIN,
  ROLE_PLATFORM_ADMIN,
  ROLE_TRANSLATOR,
  ROLE_VIEWER,
} from '../common/tenancy/roles.js';

const TENANT_RESOURCES = [
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

type Perm = Pick<Permission, 'resource' | 'action'>;

/**
 * The fixed roles and exactly what each may do. Enforced on every boot, so a
 * permission change is a code change here (no migration needed).
 */
const ROLE_DEFINITIONS: {
  name: string;
  description: string;
  grants: (p: Perm) => boolean;
}[] = [
  {
    name: ROLE_ADMIN,
    description: 'Manages the organization: users, settings, everything',
    grants: (p) => p.resource !== 'platform',
  },
  {
    name: ROLE_TRANSLATOR,
    description: 'Works on clients, jobs and documents',
    grants: (p) =>
      ([
        'clients',
        'jobs',
        'documents',
        'files',
        'calendar',
        'notifications',
      ].includes(p.resource) &&
        ['create', 'read', 'update'].includes(p.action)) ||
      // languages, labels, job types and currency are needed to create jobs
      (p.resource === 'settings' && p.action === 'read') ||
      // templates are shared by the whole organization's documents: read-only
      (p.resource === 'templates' && p.action === 'read'),
  },
  {
    name: ROLE_VIEWER,
    description: 'Read-only access',
    grants: (p) => p.resource !== 'platform' && p.action === 'read',
  },
  {
    name: ROLE_PLATFORM_ADMIN,
    description:
      'Manages organizations and platform settings — no access to their data',
    grants: (p) =>
      p.resource === 'platform' ||
      (p.resource === 'notifications' && ['read', 'update'].includes(p.action)),
  },
];

export async function seed(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);

  // ── Permissions: every resource × action (adds any that are missing) ──
  const wanted: Perm[] = [];
  for (const resource of [...TENANT_RESOURCES, 'platform']) {
    for (const action of ACTIONS) wanted.push({ resource, action });
  }
  const existing = await permissionRepo.find();
  const have = new Set(existing.map((p) => `${p.resource}:${p.action}`));
  const missing = wanted.filter((p) => !have.has(`${p.resource}:${p.action}`));
  if (missing.length) {
    await permissionRepo.save(
      missing.map((p) => ({ ...p, description: `${p.action} ${p.resource}` })),
    );
    console.log(`Seeded ${missing.length} permissions`);
  }
  const allPermissions = await permissionRepo.find();

  // ── Fixed roles with their exact permissions ──
  for (const def of ROLE_DEFINITIONS) {
    const perms = allPermissions.filter(def.grants);
    let role = await roleRepo.findOne({
      where: { name: def.name },
      relations: { permissions: true },
    });
    if (!role) {
      role = roleRepo.create({ name: def.name, description: def.description });
      console.log(`Seeded role: ${def.name}`);
    }
    const current = new Set((role.permissions ?? []).map((p) => p.id));
    const target = new Set(perms.map((p) => p.id));
    const same =
      current.size === target.size &&
      [...target].every((id) => current.has(id));
    if (!role.id || !same || role.description !== def.description) {
      role.description = def.description;
      role.permissions = perms;
      await roleRepo.save(role);
    }
  }
  // Roles from before roles were fixed: users keep working only via the fixed four.
  const fixedNames = ROLE_DEFINITIONS.map((d) => d.name);
  const stray = await roleRepo
    .createQueryBuilder('r')
    .where('r.name NOT IN (:...fixedNames)', { fixedNames })
    .getMany();
  if (stray.length) {
    console.warn(
      `[SEED] Roles outside the fixed set exist and are ignored: ${stray.map((r) => r.name).join(', ')}`,
    );
  }

  // ── Platform admin (belongs to no tenant) ──
  const platformRole = await roleRepo.findOneOrFail({
    where: { name: ROLE_PLATFORM_ADMIN },
  });
  const platformAdmins = await userRepo.count({
    where: { roleId: platformRole.id, tenantId: IsNull() },
  });
  if (platformAdmins === 0) {
    const adminEmail =
      process.env.ADMIN_INITIAL_EMAIL || 'admin@translation-assistant.com';
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123!';
    const usingDefault = !process.env.ADMIN_INITIAL_PASSWORD;
    const taken = await userRepo.findOne({ where: { email: adminEmail } });
    if (taken) {
      console.warn(
        `[SEED] No platform admin exists and ${adminEmail} is already used by a tenant user — set ADMIN_INITIAL_EMAIL to another address.`,
      );
    } else {
      await userRepo.save(
        userRepo.create({
          email: adminEmail,
          password: await bcrypt.hash(initialPassword, 12),
          firstName: 'Platform',
          lastName: 'Admin',
          roleId: platformRole.id,
          tenantId: null,
          isActive: true,
          emailVerified: true,
          mustChangePassword: usingDefault,
        }),
      );
      if (usingDefault) {
        console.warn(
          `[SECURITY] Seeded platform admin ${adminEmail} with the DEFAULT password "admin123!". ` +
            `Change it immediately, or set ADMIN_INITIAL_PASSWORD before first boot.`,
        );
      } else {
        console.log(
          `Seeded platform admin: ${adminEmail} (password from ADMIN_INITIAL_PASSWORD)`,
        );
      }
    }
  }

  // ── Platform settings row ──
  const settingsRepo = dataSource.getRepository(AppSettings);
  if ((await settingsRepo.count()) === 0) {
    await settingsRepo.save(settingsRepo.create({}));
    console.log('Seeded platform settings');
  }

  // ── Global languages (every tenant sees them) ──
  const languageRepo = dataSource.getRepository(Language);
  if ((await languageRepo.count({ where: { tenantId: IsNull() } })) === 0) {
    await languageRepo.save([
      {
        code: 'en',
        name: 'English',
        direction: 'ltr' as const,
        tenantId: null,
      },
      { code: 'ar', name: 'Arabic', direction: 'rtl' as const, tenantId: null },
      { code: 'fr', name: 'French', direction: 'ltr' as const, tenantId: null },
    ]);
    console.log('Seeded global languages: English, Arabic, French');
  }

  // ── Global contact labels ──
  const labelRepo = dataSource.getRepository(LabelOption);
  if ((await labelRepo.count({ where: { tenantId: IsNull() } })) === 0) {
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
    await labelRepo.save(defaults.map((d) => ({ ...d, tenantId: null })));
    console.log('Seeded global label options');
  }
}
