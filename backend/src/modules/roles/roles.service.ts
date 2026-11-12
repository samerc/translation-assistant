import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity.js';
import { Permission } from './entities/permission.entity.js';
import { TENANT_ROLES } from '../../common/tenancy/roles.js';

/**
 * Roles are fixed (Admin / Translator / Viewer inside a tenant, plus Platform
 * Admin). Their permissions are set by the seed on every boot, so this service
 * only reads them — there is nothing to create, rename or delete.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /** The roles a tenant admin can give. */
  findTenantRoles(): Promise<Role[]> {
    return this.roleRepository.find({
      where: { name: In(TENANT_ROLES) },
      relations: {
        permissions: true,
      },
    });
  }

  async findTenantRole(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id, name: In(TENANT_ROLES) },
      relations: {
        permissions: true,
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  /** The permission catalogue, minus the platform-only ones. */
  async findTenantPermissions(): Promise<Permission[]> {
    const all = await this.permissionRepository.find();
    return all.filter((p) => p.resource !== 'platform');
  }
}
