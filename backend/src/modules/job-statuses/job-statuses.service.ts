import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { JobStatus } from './entities/job-status.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import {
  DEFAULT_STAGE_TONES,
  JOB_STAGES,
  LOCKED_STAGES,
  OPEN_STAGES,
  STAGE_LABELS,
  STAGE_TRANSITIONS,
  type JobStage,
} from '../../common/tenancy/job-stages.js';
import type {
  CreateJobStatusDto,
  UpdateJobStatusDefDto,
} from './dto/job-status.dto.js';

export interface StatusView {
  id: string;
  stage: string;
  name: string;
  tone: string;
  notify: string;
  sortOrder: number;
  source: 'default' | 'own';
  /** Organization view: a default it hides, or an own status switched off. */
  hidden: boolean;
  /** Jobs that have it (in this organization; all organizations for the platform). */
  jobCount: number;
}

export interface StageView {
  stage: string;
  label: string;
  tone: string;
  locked: boolean;
  open: boolean;
  next: string[];
  statuses: StatusView[];
}

/**
 * Job statuses inside the fixed stages: the platform's defaults (tenantId NULL)
 * and each organization's own. An organization can hide a default and recolour
 * the stages (its `TenantSettings.jobStatusPrefs`).
 */
@Injectable()
export class JobStatusesService {
  constructor(
    @InjectRepository(JobStatus)
    private readonly repo: Repository<JobStatus>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    private readonly tenants: TenantsService,
  ) {}

  // ── Organization ──

  /** Stages with the organization's statuses (hidden ones flagged, for its settings page). */
  async catalogueForTenant(tenantId: string): Promise<StageView[]> {
    const [prefs, rows, counts] = await Promise.all([
      this.prefs(tenantId),
      this.repo.find({
        where: [{ tenantId: IsNull() }, { tenantId }],
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.jobCounts(tenantId),
    ]);
    const hidden = new Set(prefs.hidden ?? []);
    // A platform default switched off by the platform: only listed while jobs here still have it.
    const visible = rows.filter(
      (r) => r.tenantId !== null || r.isActive || counts.get(r.id),
    );
    return this.stages(
      visible.map((r) => ({
        ...this.view(r, counts),
        hidden:
          r.tenantId === null ? hidden.has(r.id) || !r.isActive : !r.isActive,
      })),
      prefs.stageTones ?? {},
    );
  }

  async createForTenant(tenantId: string, dto: CreateJobStatusDto) {
    await this.assertNameFree(dto.stage, dto.name, tenantId);
    const saved = await this.repo.save(
      this.repo.create({
        tenantId,
        stage: dto.stage,
        name: dto.name,
        tone: dto.tone,
        notify: dto.notify,
        sortOrder: await this.nextOrder(dto.stage, tenantId),
      }),
    );
    return { id: saved.id };
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateJobStatusDefDto,
  ) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || (row.tenantId !== null && row.tenantId !== tenantId))
      throw new NotFoundException('Status not found');

    if (row.tenantId === null) {
      // A platform default: an organization can only hide or show it.
      const { hidden, ...rest } = dto;
      if (Object.values(rest).some((v) => v !== undefined))
        throw new BadRequestException(
          'A default status can only be hidden or shown. Add your own status to change the name or colour.',
        );
      if (hidden === undefined) return { id };
      const prefs = await this.prefs(tenantId);
      const set = new Set(prefs.hidden ?? []);
      if (hidden) set.add(id);
      else set.delete(id);
      await this.savePrefs(tenantId, { ...prefs, hidden: [...set] });
      return { id };
    }

    if (dto.name !== undefined && dto.name !== row.name)
      await this.assertNameFree(row.stage, dto.name, tenantId, id);
    await this.repo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.tone !== undefined && { tone: dto.tone }),
      ...(dto.notify !== undefined && { notify: dto.notify }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.hidden !== undefined && { isActive: !dto.hidden }),
    });
    return { id };
  }

  async removeForTenant(tenantId: string, id: string) {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Status not found');
    await this.assertUnused(id, tenantId);
    await this.repo.delete(id);
  }

  /** The organization's colour for a stage (its core status). */
  async setStageTone(tenantId: string, stage: string, tone: string) {
    const prefs = await this.prefs(tenantId);
    const stageTones = { ...(prefs.stageTones ?? {}) };
    if (tone === DEFAULT_STAGE_TONES[stage as JobStage])
      delete stageTones[stage];
    else stageTones[stage] = tone;
    await this.savePrefs(tenantId, { ...prefs, stageTones });
    return { stage, tone };
  }

  /**
   * The status a job of this organization may be given: its own or a default it
   * doesn't hide, still offered. Another organization's id → 400 (not a 404 of the job).
   */
  async assertUsable(tenantId: string, id: string): Promise<JobStatus> {
    const row = await this.repo.findOne({ where: { id } });
    const prefs = row?.tenantId === null ? await this.prefs(tenantId) : null;
    if (
      !row ||
      (row.tenantId !== null && row.tenantId !== tenantId) ||
      !row.isActive ||
      (prefs?.hidden ?? []).includes(id)
    )
      throw new BadRequestException('That status isn’t available');
    return row;
  }

  // ── Platform defaults ──

  async findDefaults(): Promise<StageView[]> {
    const [rows, counts] = await Promise.all([
      this.repo.find({
        where: { tenantId: IsNull() },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.jobCounts(null),
    ]);
    return this.stages(
      rows.map((r) => ({ ...this.view(r, counts), hidden: !r.isActive })),
      {},
    );
  }

  async createDefault(dto: CreateJobStatusDto) {
    await this.assertNameFree(dto.stage, dto.name, null);
    const saved = await this.repo.save(
      this.repo.create({
        tenantId: null,
        stage: dto.stage,
        name: dto.name,
        tone: dto.tone,
        notify: dto.notify,
        sortOrder: await this.nextOrder(dto.stage, null),
      }),
    );
    return { id: saved.id };
  }

  async updateDefault(id: string, dto: UpdateJobStatusDefDto) {
    const row = await this.repo.findOne({ where: { id, tenantId: IsNull() } });
    if (!row) throw new NotFoundException('Status not found');
    if (dto.name !== undefined && dto.name !== row.name)
      await this.assertNameFree(row.stage, dto.name, null, id);
    await this.repo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.tone !== undefined && { tone: dto.tone }),
      ...(dto.notify !== undefined && { notify: dto.notify }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.hidden !== undefined && { isActive: !dto.hidden }),
    });
    return { id };
  }

  async removeDefault(id: string) {
    const row = await this.repo.findOne({ where: { id, tenantId: IsNull() } });
    if (!row) throw new NotFoundException('Status not found');
    await this.assertUnused(id, null);
    await this.repo.delete(id);
  }

  // ── Helpers ──

  private view(
    r: JobStatus,
    counts: Map<string, number>,
  ): Omit<StatusView, 'hidden'> {
    return {
      id: r.id,
      stage: r.stage,
      name: r.name,
      tone: r.tone,
      notify: r.notify,
      sortOrder: r.sortOrder,
      source: r.tenantId === null ? 'default' : 'own',
      jobCount: counts.get(r.id) ?? 0,
    };
  }

  private stages(
    statuses: StatusView[],
    tones: Record<string, string>,
  ): StageView[] {
    return JOB_STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      tone: tones[stage] ?? DEFAULT_STAGE_TONES[stage],
      locked: LOCKED_STAGES.includes(stage),
      open: OPEN_STAGES.includes(stage),
      next: STAGE_TRANSITIONS[stage],
      // Defaults first (platform order), then the organization's own.
      statuses: statuses
        .filter((s) => s.stage === stage)
        .sort(
          (a, b) =>
            (a.source === b.source ? 0 : a.source === 'default' ? -1 : 1) ||
            a.sortOrder - b.sortOrder,
        ),
    }));
  }

  /** Jobs per status — this organization's, or every organization's (platform). */
  private async jobCounts(tenantId: string | null) {
    const qb = this.jobRepo
      .createQueryBuilder('j')
      .select('j.custom_status_id', 'id')
      .addSelect('COUNT(*)', 'n')
      .where('j.custom_status_id IS NOT NULL')
      .groupBy('j.custom_status_id');
    if (tenantId) qb.andWhere('j.tenant_id = :tenantId', { tenantId });
    const rows = await qb.getRawMany<{ id: string; n: string | number }>();
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
  }

  private async assertUnused(id: string, tenantId: string | null) {
    const n = await this.jobRepo.count({
      where: tenantId
        ? { customStatusId: id, tenantId }
        : { customStatusId: id },
    });
    if (n > 0)
      throw new BadRequestException(
        `${n} job${n === 1 ? ' has' : 's have'} this status — hide it instead, or move ${n === 1 ? 'that job' : 'those jobs'} first.`,
      );
  }

  /** Unique per stage among the platform defaults + the organization's own (case-insensitive). */
  private async assertNameFree(
    stage: string,
    name: string,
    tenantId: string | null,
    exceptId?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.stage = :stage', { stage })
      .andWhere('LOWER(s.name) = LOWER(:name)', { name });
    if (tenantId)
      qb.andWhere('(s.tenant_id IS NULL OR s.tenant_id = :tenantId)', {
        tenantId,
      });
    // A default only has to be unique among the defaults (organizations keep their own).
    else qb.andWhere('s.tenant_id IS NULL');
    if (exceptId) qb.andWhere('s.id != :exceptId', { exceptId });
    const clash = await qb.getCount();
    const core =
      STAGE_LABELS[stage as JobStage]?.toLowerCase() === name.toLowerCase();
    if (clash || core)
      throw new BadRequestException(
        `There is already a status called "${name}" in ${STAGE_LABELS[stage as JobStage]}`,
      );
  }

  private async nextOrder(stage: string, tenantId: string | null) {
    const r = await this.repo
      .createQueryBuilder('s')
      .select('MAX(s.sortOrder)', 'max')
      .where('s.stage = :stage', { stage })
      .andWhere(tenantId ? 's.tenant_id = :tenantId' : 's.tenant_id IS NULL', {
        tenantId,
      })
      .getRawOne<{ max: number | string | null }>();
    return Number(r?.max ?? 0) + 1;
  }

  private async prefs(tenantId: string) {
    return (await this.tenants.getSettings(tenantId)).jobStatusPrefs ?? {};
  }

  private async savePrefs(
    tenantId: string,
    prefs: NonNullable<TenantSettings['jobStatusPrefs']>,
  ) {
    await this.tenants.getSettings(tenantId);
    await this.settingsRepo.update({ tenantId }, { jobStatusPrefs: prefs });
  }
}
