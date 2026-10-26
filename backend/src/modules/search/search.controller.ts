import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('search')
@UseGuards(AuthGuard('jwt'))
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('q') q: string, @CurrentUser() user: User) {
    if (!q || q.length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }
    const results = await this.searchService.search(
      q,
      user.id,
      user.role?.name === 'Admin',
    );
    // Search spans four resources; only return the ones the caller may read
    // (e.g. a Translator has no invoices:read and must not see invoice numbers).
    const canRead = (resource: string) =>
      (user.role?.permissions ?? []).some(
        (p) => p.resource === resource && p.action === 'read',
      );
    for (const resource of [
      'clients',
      'jobs',
      'templates',
      'invoices',
    ] as const) {
      if (!canRead(resource)) {
        results[resource] = [];
        results.counts[resource] = 0;
      }
    }
    return results;
  }
}
