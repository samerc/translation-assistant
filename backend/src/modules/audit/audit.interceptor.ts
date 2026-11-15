import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, mergeMap, switchMap } from 'rxjs';
import type { MaybeAuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { AUDIT_KEY, type AuditMeta } from './audited.decorator.js';
import { AuditService } from './audit.service.js';

const MAX_VALUE = 200;

/** A body value small enough to keep (strings cut, objects dropped). */
function keepable(v: unknown): unknown {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string')
    return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE)}…` : v;
  if (Array.isArray(v)) return v.length;
  return undefined;
}

/**
 * Global: for routes marked `@Audited()`, writes an audit entry once the
 * handler has succeeded. The target's label is read *before* the handler runs
 * (a delete removes it) and, for creates, from the response's id afterwards.
 * Recording never fails the request — errors are logged.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta || context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<MaybeAuthenticatedRequest>();
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    const body = (
      req.body && typeof req.body === 'object' ? req.body : {}
    ) as Record<string, unknown>;
    const targetId = meta.target ? params[meta.param ?? 'id'] : undefined;

    const before = (async () => {
      const target =
        meta.target && targetId
          ? await this.audit.describe(meta.target, targetId)
          : null;
      const refs: Record<string, unknown> = {};
      for (const ref of meta.refs ?? []) {
        const id = ref.from === 'param' ? params[ref.name] : body[ref.name];
        if (id === undefined || id === null || id === '') continue;
        const found = await this.audit.describe(ref.type, id);
        refs[ref.key] = found?.label ?? id;
      }
      return { target, refs };
    })().catch((err: unknown) => {
      this.logger.error(
        `Audit lookup failed for ${meta.action}`,
        err instanceof Error ? err.stack : String(err),
      );
      return { target: null, refs: {} };
    });

    return from(before).pipe(
      switchMap((pre) =>
        next.handle().pipe(
          mergeMap(async (response: unknown) => {
            try {
              await this.write(meta, req, body, targetId, pre, response);
            } catch (err) {
              this.logger.error(
                `Audit write failed for ${meta.action}`,
                err instanceof Error ? err.stack : String(err),
              );
            }
            return response;
          }),
        ),
      ),
    );
  }

  private async write(
    meta: AuditMeta,
    req: MaybeAuthenticatedRequest,
    body: Record<string, unknown>,
    paramId: string | undefined,
    pre: {
      target: { label: string | null; tenantId: string | null } | null;
      refs: Record<string, unknown>;
    },
    response: unknown,
  ) {
    const user = req.user;
    if (!user) return;
    let target = pre.target;
    let targetId = paramId ?? null;
    if (meta.target && !targetId) {
      const id = (meta.responseId ?? 'id')
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          response,
        );
      if (typeof id === 'string') {
        targetId = id;
        target = await this.audit.describe(meta.target, id);
      }
    }

    const details: Record<string, unknown> = { ...pre.refs };
    for (const key of meta.body ?? []) {
      const v = keepable(body[key]);
      if (v !== undefined) details[key] = v;
    }
    if (meta.bodyKeys) {
      const fields = Object.keys(body).filter((k) => k !== '_hp');
      if (fields.length) details.fields = fields;
    }

    await this.audit.record({
      tenantId: user.tenantId ?? target?.tenantId ?? null,
      actorUserId: user.id,
      actorName:
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      actorRole: user.role?.name ?? null,
      byPlatform: !user.tenantId,
      action: meta.action,
      targetType: meta.target ?? null,
      targetId,
      targetLabel: target?.label ?? null,
      details: Object.keys(details).length ? details : null,
      ip: req.ip ?? null,
    });
  }
}
