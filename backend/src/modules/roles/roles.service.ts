import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { Role, type JobScope } from './entities/role.entity.js';
import { Permission } from './entities/permission.entity.js';
import { User } from '../users/entities/user.entity.js';
import { InviteToken } from '../auth/entities/invite-token.entity.js';
import {
  ALWAYS_GRANTED,
  GRANTABLE_RESOURCES,
  RESERVED_ROLE_NAMES,
  ROLE_ACTIONS,
  ROLE_PLATFORM_ADMIN,
  ROLE_TRANSLATOR,
} from '../../common/tenancy/roles.js';
import { isAdminRole } from '../../common/tenancy/actor.js';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';

/** A role as the Team / platform Roles pages show it. */
export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  /** Admin: everything, can't be changed. */
  locked: boolean;
  /** default = the platform's, as is; customized = this organization's copy of a default; own = made by the organization. */
  source: 'default' | 'customized' | 'own';
  jobScope: JobScope;
  seesPrices: boolean;
  permissions: { resource: string; action: string }[];
  /** People who have it (in the organization; platform-wide for the platform list). */
  userCount: number;
  /** Platform list: organizations that customized it. */
  customizedBy?: number;
}

const ORDER = ['Admin', 'Translator', 'Viewer'];

/**
 * Roles: the platform's (built-in + the defaults the platform admin adds,
 * `tenantId` NULL) and each organization's own. An organization sees the
 * platform roles it hasn't customized, its customized copies, and its own.
 * Changing a default for one organization copies it (`overridesRoleId`) and
 * moves that organization's people (and pending invites) to the copy; "reset"
 * moves them back and drops the copy. Admin and Platform Admin are locked.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /** What can be granted: areas × actions. */
  catalogue() {
    return {
      resources: GRANTABLE_RESOURCES,
      actions: ROLE_ACTIONS,
    };
  }

  // ── An organization's roles ──

  /** The roles of an organization (what its Admin can give). */
  async findForTenant(tenantId: string): Promise<RoleView[]> {
    const roles = await this.effectiveRoles(tenantId);
    const counts = await this.userCounts(
      roles.map((r) => r.id),
      tenantId,
    );
    return this.sorted(roles.map((r) => this.view(r, counts.get(r.id) ?? 0)));
  }

  /** A role the organization can give (400 otherwise — never another organization's, never Platform Admin). */
  async assertAssignable(roleId: string, tenantId: string): Promise<Role> {
    const role = (await this.effectiveRoles(tenantId)).find(
      (r) => r.id === roleId,
    );
    if (!role) throw new BadRequestException('Role not found');
    return role;
  }

  /** The organization's version of a built-in role (its copy if it customized it). */
  async findByNameForTenant(
    name: string,
    tenantId: string,
  ): Promise<Role | null> {
    return (
      (await this.effectiveRoles(tenantId)).find(
        (r) => r.isBuiltIn && r.name === name,
      ) ?? null
    );
  }

  /** Default role for an invite without one. */
  defaultInviteRole(tenantId: string) {
    return this.findByNameForTenant(ROLE_TRANSLATOR, tenantId);
  }

  async createForTenant(
    tenantId: string,
    dto: CreateRoleDto,
  ): Promise<RoleView> {
    await this.assertNameFree(dto.name, tenantId);
    const role = await this.roleRepository.save(
      this.roleRepository.create({
        name: dto.name,
        description: dto.description || null,
        tenantId,
        isBuiltIn: false,
        overridesRoleId: null,
        jobScope: dto.jobScope,
        seesPrices: dto.seesPrices,
        permissions: await this.permissionsFor(dto.permissions),
      }),
    );
    return this.view(await this.load(role.id), 0);
  }

  /**
   * Change one of the organization's roles. A platform default is copied for
   * the organization first (its people and pending invites move to the copy).
   */
  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<RoleView> {
    const role = await this.findInTenant(id, tenantId);
    this.assertEditable(role);
    if (dto.name !== undefined && dto.name !== role.name) {
      if (role.isBuiltIn)
        throw new BadRequestException('A built-in role keeps its name');
      await this.assertNameFree(dto.name, tenantId, role.id);
    }
    const permissions =
      dto.permissions !== undefined
        ? await this.permissionsFor(dto.permissions)
        : undefined;

    const savedId = await this.roleRepository.manager.transaction(async (m) => {
      let target = role;
      if (role.tenantId === null) {
        // Customize a default for this organization only.
        target = await m.save(
          Role,
          m.create(Role, {
            name: role.name,
            description: role.description,
            tenantId,
            isBuiltIn: role.isBuiltIn,
            overridesRoleId: role.id,
            jobScope: role.jobScope,
            seesPrices: role.seesPrices,
            permissions: role.permissions,
          }),
        );
        await this.moveTenantPeople(m, tenantId, role.id, target.id);
      }
      this.apply(target, dto, permissions);
      await m.save(Role, target);
      return target.id;
    });
    const fresh = await this.load(savedId);
    const counts = await this.userCounts([fresh.id], tenantId);
    return this.view(fresh, counts.get(fresh.id) ?? 0);
  }

  /** Drop the organization's copy of a default: its people go back to the default. */
  async resetForTenant(tenantId: string, id: string): Promise<RoleView> {
    const role = await this.findInTenant(id, tenantId);
    if (role.tenantId === null || !role.overridesRoleId)
      throw new BadRequestException('Only a customized default can be reset');
    const original = await this.roleRepository.findOne({
      where: { id: role.overridesRoleId, tenantId: IsNull() },
    });
    if (!original)
      throw new BadRequestException(
        'The default this role came from no longer exists',
      );
    await this.roleRepository.manager.transaction(async (m) => {
      await this.moveTenantPeople(m, tenantId, role.id, original.id);
      await m.delete(Role, { id: role.id });
    });
    const fresh = await this.load(original.id);
    const counts = await this.userCounts([fresh.id], tenantId);
    return this.view(fresh, counts.get(fresh.id) ?? 0);
  }

  /** Delete one of the organization's own roles (nobody may have it). */
  async removeForTenant(tenantId: string, id: string): Promise<void> {
    const role = await this.findInTenant(id, tenantId);
    if (role.tenantId === null)
      throw new BadRequestException('Default roles can’t be deleted here');
    if (role.overridesRoleId)
      throw new BadRequestException(
        'This is a customized default — reset it instead',
      );
    await this.assertUnused(role.id);
    await this.roleRepository.delete({ id: role.id, tenantId });
  }

  // ── The platform's defaults (platform admin) ──

  async findDefaults(): Promise<RoleView[]> {
    const roles = await this.roleRepository.find({
      where: { tenantId: IsNull(), name: Not(ROLE_PLATFORM_ADMIN) },
    });
    const ids = roles.map((r) => r.id);
    const counts = await this.userCounts(ids);
    const copies = ids.length
      ? await this.roleRepository
          .createQueryBuilder('r')
          .select('r.overridesRoleId', 'id')
          .addSelect('COUNT(*)', 'n')
          .where('r.overridesRoleId IN (:...ids)', { ids })
          .groupBy('r.overridesRoleId')
          .getRawMany<{ id: string; n: string | number }>()
      : [];
    const customized = new Map(copies.map((c) => [c.id, Number(c.n)]));
    return this.sorted(
      roles.map((r) => ({
        ...this.view(r, counts.get(r.id) ?? 0),
        customizedBy: customized.get(r.id) ?? 0,
      })),
    );
  }

  async createDefault(dto: CreateRoleDto): Promise<RoleView> {
    await this.assertNameFree(dto.name, null);
    const role = await this.roleRepository.save(
      this.roleRepository.create({
        name: dto.name,
        description: dto.description || null,
        tenantId: null,
        isBuiltIn: false,
        overridesRoleId: null,
        jobScope: dto.jobScope,
        seesPrices: dto.seesPrices,
        permissions: await this.permissionsFor(dto.permissions),
      }),
    );
    return { ...this.view(await this.load(role.id), 0), customizedBy: 0 };
  }

  /** Change a default: every organization that didn't customize it follows. */
  async updateDefault(id: string, dto: UpdateRoleDto): Promise<RoleView> {
    const role = await this.findDefault(id);
    this.assertEditable(role);
    if (dto.name !== undefined && dto.name !== role.name) {
      if (role.isBuiltIn)
        throw new BadRequestException('A built-in role keeps its name');
      await this.assertNameFree(dto.name, null, role.id);
    }
    const permissions =
      dto.permissions !== undefined
        ? await this.permissionsFor(dto.permissions)
        : undefined;
    this.apply(role, dto, permissions);
    await this.roleRepository.save(role);
    return (await this.findDefaults()).find((r) => r.id === id)!;
  }

  /**
   * Delete a default nobody has. Organizations' customized copies of it stay,
   * as their own roles.
   */
  async removeDefault(id: string): Promise<void> {
    const role = await this.findDefault(id);
    if (role.isBuiltIn)
      throw new BadRequestException('Built-in roles can’t be deleted');
    await this.assertUnused(role.id);
    await this.roleRepository.manager.transaction(async (m) => {
      await m.update(
        Role,
        { overridesRoleId: role.id },
        { overridesRoleId: null },
      );
      await m.delete(Role, { id: role.id });
    });
  }

  // ── Helpers ──

  /** Platform roles not customized by the organization + the organization's own. */
  private async effectiveRoles(tenantId: string): Promise<Role[]> {
    const [platform, own] = await Promise.all([
      this.roleRepository.find({
        where: { tenantId: IsNull(), name: Not(ROLE_PLATFORM_ADMIN) },
      }),
      this.roleRepository.find({ where: { tenantId } }),
    ]);
    const replaced = new Set(
      own.map((r) => r.overridesRoleId).filter((x): x is string => !!x),
    );
    return [...platform.filter((r) => !replaced.has(r.id)), ...own];
  }

  private async findInTenant(id: string, tenantId: string): Promise<Role> {
    const role = (await this.effectiveRoles(tenantId)).find((r) => r.id === id);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async findDefault(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id, tenantId: IsNull(), name: Not(ROLE_PLATFORM_ADMIN) },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private load(id: string): Promise<Role> {
    return this.roleRepository.findOneOrFail({ where: { id } });
  }

  private assertEditable(role: Role) {
    if (isAdminRole(role) || role.name === ROLE_PLATFORM_ADMIN)
      throw new BadRequestException(
        'Admin always has every permission and can’t be changed',
      );
  }

  /**
   * Names are unique (ignoring case) among the roles the organization sees —
   * for a new default, among the platform roles — and never a built-in name.
   */
  private async assertNameFree(
    name: string,
    tenantId: string | null,
    exceptId?: string,
  ) {
    const lower = name.trim().toLowerCase();
    if (RESERVED_ROLE_NAMES.some((n) => n.toLowerCase() === lower))
      throw new BadRequestException(`“${name}” is a built-in role name`);
    const roles = tenantId
      ? await this.effectiveRoles(tenantId)
      : await this.roleRepository.find({ where: { tenantId: IsNull() } });
    if (roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === lower))
      throw new BadRequestException(`There is already a role called “${name}”`);
  }

  /**
   * Requested `area:action` keys → permissions: only grantable areas; any right
   * on an area includes viewing it; plus what every role needs.
   */
  private async permissionsFor(keys: string[]): Promise<Permission[]> {
    const wanted = new Set<string>(ALWAYS_GRANTED);
    for (const key of keys) {
      const [resource, action] = key.split(':');
      if (
        !GRANTABLE_RESOURCES.includes(resource) ||
        !ROLE_ACTIONS.includes(action)
      )
        throw new BadRequestException(`Unknown permission: ${key}`);
      wanted.add(key);
      wanted.add(`${resource}:read`);
    }
    const all = await this.permissionRepository.find();
    return all.filter((p) => wanted.has(`${p.resource}:${p.action}`));
  }

  private apply(role: Role, dto: UpdateRoleDto, permissions?: Permission[]) {
    if (dto.name !== undefined && !role.isBuiltIn) role.name = dto.name;
    if (dto.description !== undefined)
      role.description = dto.description || null;
    if (dto.jobScope !== undefined) role.jobScope = dto.jobScope;
    if (dto.seesPrices !== undefined) role.seesPrices = dto.seesPrices;
    if (permissions) role.permissions = permissions;
  }

  /** The organization's people and pending invites move from one role to another. */
  private async moveTenantPeople(
    m: EntityManager,
    tenantId: string,
    from: string,
    to: string,
  ) {
    await m.update(User, { tenantId, roleId: from }, { roleId: to });
    await m.update(
      InviteToken,
      { tenantId, roleId: from, used: false },
      { roleId: to },
    );
  }

  private async assertUnused(roleId: string) {
    const [users, invites] = await Promise.all([
      this.roleRepository.manager.count(User, { where: { roleId } }),
      this.roleRepository.manager.count(InviteToken, {
        where: { roleId, used: false },
      }),
    ]);
    if (users || invites)
      throw new BadRequestException(
        `${users} ${users === 1 ? 'person has' : 'people have'} this role${invites ? ` and ${invites} pending invitation${invites === 1 ? '' : 's'} use it` : ''} — give them another role first`,
      );
  }

  private async userCounts(roleIds: string[], tenantId?: string) {
    if (!roleIds.length) return new Map<string, number>();
    const qb = this.roleRepository.manager
      .createQueryBuilder(User, 'u')
      .select('u.roleId', 'id')
      .addSelect('COUNT(*)', 'n')
      .where({ roleId: In(roleIds) });
    if (tenantId) qb.andWhere('u.tenantId = :tenantId', { tenantId });
    const rows = await qb
      .groupBy('u.roleId')
      .getRawMany<{ id: string; n: string | number }>();
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
  }

  private view(r: Role, userCount: number): RoleView {
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      isBuiltIn: r.isBuiltIn,
      locked: isAdminRole(r),
      source:
        r.tenantId === null
          ? 'default'
          : r.overridesRoleId
            ? 'customized'
            : 'own',
      jobScope: isAdminRole(r) ? 'all' : r.jobScope,
      seesPrices: isAdminRole(r) || r.seesPrices,
      permissions: (r.permissions ?? [])
        .filter((p) => GRANTABLE_RESOURCES.includes(p.resource))
        .map((p) => ({ resource: p.resource, action: p.action })),
      userCount,
    };
  }

  private sorted(list: RoleView[]): RoleView[] {
    const rank = (r: RoleView) => {
      const i = ORDER.indexOf(r.name);
      return r.isBuiltIn && i >= 0 ? i : ORDER.length;
    };
    return [...list].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }
}
