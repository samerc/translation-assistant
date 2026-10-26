import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedRequest['user'] | undefined,
    ctx: ExecutionContext,
  ) => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    return data ? user?.[data] : user;
  },
);
