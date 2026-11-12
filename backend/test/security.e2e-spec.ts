import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FindOperator, getMetadataArgsStorage } from 'typeorm';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lastValueFrom, of, throwError } from 'rxjs';
import { User } from '../src/modules/users/entities/user.entity.js';
import { SettingsController } from '../src/modules/settings/settings.controller.js';
import { PlatformController } from '../src/modules/platform/platform.controller.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';
import { RolesService } from '../src/modules/roles/roles.service.js';
import { UploadCleanupInterceptor } from '../src/common/interceptors/upload-cleanup.interceptor.js';
import * as bcrypt from 'bcrypt';
import {
  cloudflareClientIp,
  isCloudflareIp,
  normalizeIp,
} from '../src/common/utils/client-ip.js';
import { likeContains } from '../src/common/utils/like.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy.js';
import { JwtRefreshStrategy } from '../src/modules/auth/strategies/jwt-refresh.strategy.js';
import { DocumentsController } from '../src/modules/documents/documents.controller.js';
import { ClientsController } from '../src/modules/clients/clients.controller.js';
import { AbuseDetectionGuard } from '../src/common/guards/abuse-detection.guard.js';
import { InvoicesService } from '../src/modules/invoices/invoices.service.js';
import { InvoiceExportService } from '../src/modules/invoices/invoice-export.service.js';
import {
  sniffType,
  sniffImageMime,
} from '../src/common/utils/file-signature.js';

/**
 * Security-layer integration tests for the audit-fixes remediation.
 *
 * These are DB-free: repositories are backed by tiny in-memory fakes so the real
 * AuthService / strategies / controllers run their actual logic (JWT signing,
 * SHA-256 session hashing, type-claim enforcement, IDOR access checks) without a
 * live MariaDB. They exercise the exact code paths the audit changed:
 *   1. Refresh-token architecture (signed JWT + type claim + session rotation)
 *   2. Access/refresh token-type enforcement in both passport strategies
 *   3. IDOR guards on passport-file serving and document cloning
 */

const TEST_SECRET = 'test-secret-do-not-use-in-prod';
const IP = '10.0.0.1';
const UA = 'jest-agent';

// ── Config + Jwt (real) ──
const configService = {
  get: (key: string) =>
    (
      ({ 'jwt.secret': TEST_SECRET, 'jwt.accessTokenTtl': 900 }) as Record<
        string,
        unknown
      >
    )[key],
} as any;
const jwtService = new JwtService({ secret: TEST_SECRET });

// ── In-memory repository fakes ──
function matches(entity: any, where: any): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (cond instanceof FindOperator) {
      if (cond.type === 'moreThan') return entity[k] > cond.value;
      return false;
    }
    return entity[k] === cond;
  });
}

let idSeq = 0;
function makeSessionRepo() {
  const rows: any[] = [];
  return {
    rows,
    // The Session entity defaults `revoked` to false at the DB layer; the real
    // createSession() omits it and relies on that default, so mirror it here.
    create: (obj: any) => ({ revoked: false, ...obj }),
    save: (entity: any) => {
      if (!entity.id) {
        entity.id = `sess-${++idSeq}`;
        entity.createdAt = new Date();
        rows.push(entity);
      } else {
        const i = rows.findIndex((r) => r.id === entity.id);
        if (i >= 0) rows[i] = entity;
        else rows.push(entity);
      }
      return Promise.resolve(entity);
    },
    findOne: ({ where }: any) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    find: ({ where }: any) =>
      Promise.resolve(rows.filter((r) => matches(r, where))),
    update: (criteria: any, patch: any) => {
      let affected = 0;
      for (const r of rows) {
        if (matches(r, criteria)) {
          Object.assign(r, patch);
          affected++;
        }
      }
      return Promise.resolve({ affected });
    },
  };
}

const noopRepo = {
  findOne: () => Promise.resolve(null),
  find: () => Promise.resolve([]),
  save: (e: any) => Promise.resolve(e),
  create: (e: any) => e,
  update: () => Promise.resolve({ affected: 0 }),
} as any;

const mailService = {
  sendInvite: () => Promise.resolve(),
  sendPasswordReset: () => Promise.resolve(),
} as any;

// AuthService deps added with multi-tenancy (verification tokens, tenants,
// settings, Turnstile, DataSource) — not used by these tests.
const AUTH_EXTRAS = [noopRepo, {}, {}, {}, {}] as [any, any, any, any, any];

// Callers as the services see them (tenant t1).
const T_USER = { userId: 'user-1', tenantId: 't1', isAdmin: false };
const T_ADMIN = { userId: 'admin', tenantId: 't1', isAdmin: true };

describe('Refresh-token architecture (AuthService)', () => {
  let authService: AuthService;
  let sessionRepo: ReturnType<typeof makeSessionRepo>;
  let user: any;

  beforeAll(async () => {
    // The service starts a cleanup setInterval — stub it so jest can exit cleanly.
    jest.spyOn(global, 'setInterval').mockReturnValue(0 as any);

    // jsonwebtoken stamps `iat` at 1-second resolution, so a login + immediate
    // refresh in the same wall-clock second would mint byte-identical tokens.
    // Advance a fake clock on every read so each signed token (and its hash) is
    // unique — mirroring real usage where rotations are seconds/minutes apart.
    let clock = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => (clock += 5000));

    const passwordHash = await bcrypt.hash('Str0ng!Pass', 10);
    user = {
      id: 'user-1',
      email: 'alice@example.com',
      password: passwordHash,
      isActive: true,
      emailVerified: true,
      tenantId: 't1',
      tenant: { id: 't1', name: 'Org', status: 'active' },
      firstName: 'Alice',
      lastName: 'A',
      role: { id: 'r1', name: 'Translator', permissions: [] },
    };

    const userRepo = {
      findOne: ({ where }: any) =>
        Promise.resolve(
          (where.id && where.id === user.id) ||
            (where.email && where.email === user.email)
            ? user
            : null,
        ),
      update: () => Promise.resolve({ affected: 1 }),
    } as any;

    sessionRepo = makeSessionRepo();
    authService = new AuthService(
      userRepo,
      noopRepo, // invite
      noopRepo, // reset
      sessionRepo as any,
      jwtService,
      configService,
      mailService,
      ...AUTH_EXTRAS,
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('login issues distinct access + refresh JWTs carrying the correct type claim', async () => {
    const res = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );

    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
    expect(res.accessToken).not.toEqual(res.refreshToken);

    const access = jwtService.verify(res.accessToken);
    const refresh = jwtService.verify(res.refreshToken);
    expect(access.type).toBe('access');
    expect(refresh.type).toBe('refresh');
    expect(refresh.sub).toBe('user-1');

    // A session row was persisted (hashed, never the raw token).
    expect(sessionRepo.rows.length).toBe(1);
    expect(sessionRepo.rows[0].refreshTokenHash).not.toEqual(res.refreshToken);
    expect(sessionRepo.rows[0].refreshTokenHash).toHaveLength(64); // sha256 hex
  });

  it('two logins in the same second get distinct refresh tokens (jti)', async () => {
    const creds = { email: 'alice@example.com', password: 'Str0ng!Pass' };
    const [a, b] = await Promise.all([
      authService.login(creds, IP, UA),
      authService.login(creds, IP, UA),
    ]);
    expect(a.refreshToken).not.toEqual(b.refreshToken);
    const hashes = sessionRepo.rows.map((r) => r.refreshTokenHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('refresh rotates the token; the new one keeps working', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );

    const rotated = await authService.refreshTokens(
      user.id,
      login.refreshToken,
      IP,
      UA,
    );
    expect(rotated.refreshToken).not.toEqual(login.refreshToken);
    expect(jwtService.verify(rotated.refreshToken).type).toBe('refresh');

    const again = await authService.refreshTokens(
      user.id,
      rotated.refreshToken,
      IP,
      UA,
    );
    expect(again.refreshToken).toBeDefined();
  });

  it('replaying an already-rotated refresh token revokes the whole session (reuse detection)', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );
    const rotated = await authService.refreshTokens(
      user.id,
      login.refreshToken,
      IP,
      UA,
    );

    // The OLD token is refused (one-time use)…
    await expect(
      authService.refreshTokens(user.id, login.refreshToken, IP, UA),
    ).rejects.toThrow(ForbiddenException);
    // …and because it was a replay, the current token dies with the session.
    await expect(
      authService.refreshTokens(user.id, rotated.refreshToken, IP, UA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an unknown / forged refresh token', async () => {
    const forged = await jwtService.signAsync({
      sub: user.id,
      type: 'refresh',
    });
    await expect(
      authService.refreshTokens(user.id, forged, IP, UA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('an IP / device change is recorded but does not end the session', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );

    // Wi-Fi → mobile data, a new Cloudflare edge, a browser update: normal.
    const rotated = await authService.refreshTokens(
      user.id,
      login.refreshToken,
      '203.0.113.9',
      UA + ' Updated/2',
    );
    expect(rotated.refreshToken).toBeDefined();
    const session = sessionRepo.rows.find(
      (r) => r.previousRefreshTokenHash && r.ipAddress === '203.0.113.9',
    );
    expect(session).toBeDefined(); // the session now shows the current IP
  });

  it('logout revokes the session so its refresh token stops working', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );
    await authService.logout(user.id, login.refreshToken);
    await expect(
      authService.refreshTokens(user.id, login.refreshToken, IP, UA),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('Token-type enforcement (passport strategies)', () => {
  const activeUser = {
    id: 'user-1',
    isActive: true,
    emailVerified: true,
    tenantId: 't1',
    tenant: { id: 't1', status: 'active' },
    role: { name: 'Translator', permissions: [] },
  };
  const userRepo = {
    findOne: ({ where }: any) =>
      Promise.resolve(where.id === activeUser.id ? activeUser : null),
  } as any;

  const jwtStrategy = new JwtStrategy(configService, userRepo);
  const refreshStrategy = new JwtRefreshStrategy(configService);

  it('JwtStrategy (access) refuses a refresh-type token', async () => {
    await expect(
      jwtStrategy.validate({ sub: 'user-1', type: 'refresh' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('JwtStrategy refuses a file-access token (travels in URLs, no type claim)', async () => {
    const fileToken = new AuthService(
      noopRepo,
      noopRepo,
      noopRepo,
      noopRepo,
      jwtService,
      configService,
      mailService,
      ...AUTH_EXTRAS,
    ).generateFileToken('user-1');
    await expect(
      jwtStrategy.validate(jwtService.verify(fileToken)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('JwtStrategy accepts a valid access token for an active user', async () => {
    const u = await jwtStrategy.validate({ sub: 'user-1', type: 'access' });
    expect(u.id).toBe('user-1');
  });

  it('JwtStrategy rejects users of a suspended or pending organization', async () => {
    for (const status of ['suspended', 'pending']) {
      activeUser.tenant.status = status;
      await expect(
        jwtStrategy.validate({ sub: 'user-1', type: 'access' }),
      ).rejects.toThrow(UnauthorizedException);
    }
    activeUser.tenant.status = 'active';
  });

  it('JwtStrategy rejects an unknown / inactive user', async () => {
    await expect(
      jwtStrategy.validate({ sub: 'ghost', type: 'access' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('JwtRefreshStrategy refuses an access-type token', () => {
    const req = {
      cookies: { refresh_token: 'x' },
      get: () => undefined,
    } as any;
    expect(() =>
      refreshStrategy.validate(req, { sub: 'user-1', type: 'access' }),
    ).toThrow(UnauthorizedException);
  });

  it('JwtRefreshStrategy accepts a refresh token and surfaces it from the cookie', () => {
    const req = {
      cookies: { refresh_token: 'cookie-token' },
      get: () => undefined,
    } as any;
    const result = refreshStrategy.validate(req, {
      sub: 'user-1',
      type: 'refresh',
    });
    expect(result.refreshToken).toBe('cookie-token');
    expect(result.type).toBe('refresh');
  });
});

describe('IDOR guards (controllers)', () => {
  const nonAdmin = T_USER;

  describe('Document create — cloning requires access to the source document', () => {
    it('blocks cloning a document the user cannot access', async () => {
      const documentsService = {
        verifyJobAccess: jest.fn().mockResolvedValue(undefined),
        verifyDocumentAccess: jest
          .fn()
          .mockRejectedValue(new ForbiddenException()),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      } as any;
      const controller = new DocumentsController(documentsService, {} as any);

      await expect(
        controller.create(
          { jobId: 'job-1', clonedFromId: 'secret-doc' } as any,
          nonAdmin,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Access to the clone source was checked, and creation never happened.
      expect(documentsService.verifyDocumentAccess).toHaveBeenCalledWith(
        'secret-doc',
        T_USER,
      );
      expect(documentsService.create).not.toHaveBeenCalled();
    });

    it('allows cloning when the user has access to the source', async () => {
      const documentsService = {
        verifyJobAccess: jest.fn().mockResolvedValue(undefined),
        verifyDocumentAccess: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      } as any;
      const controller = new DocumentsController(documentsService, {} as any);

      const res = await controller.create(
        { jobId: 'job-1', clonedFromId: 'my-doc' } as any,
        nonAdmin,
      );
      expect(res).toEqual({ id: 'new' });
      expect(documentsService.create).toHaveBeenCalled();
    });

    it('does not check clone access when not cloning', async () => {
      const documentsService = {
        verifyJobAccess: jest.fn().mockResolvedValue(undefined),
        verifyDocumentAccess: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      } as any;
      const controller = new DocumentsController(documentsService, {} as any);

      await controller.create({ jobId: 'job-1' } as any, nonAdmin);
      expect(documentsService.verifyDocumentAccess).not.toHaveBeenCalled();
      expect(documentsService.create).toHaveBeenCalled();
    });
  });

  describe('Passport file serving — file token must belong to someone with client access', () => {
    function makeRes() {
      return {
        statusCode: 0,
        body: null as any,
        status(c: number) {
          this.statusCode = c;
          return this;
        },
        json(b: any) {
          this.body = b;
          return this;
        },
        setHeader() {},
      };
    }

    it('rejects a request with no token (401)', async () => {
      const controller = new ClientsController({} as any, {} as any);
      const res = makeRes();
      await controller.viewPassportCopy('client-1', 'copy-1', '', res as any);
      expect(res.statusCode).toBe(401);
    });

    it('rejects an invalid file token (401)', async () => {
      const authService = {
        actorForFileToken: jest.fn(() =>
          Promise.reject(new Error('bad token')),
        ),
      } as any;
      const controller = new ClientsController({} as any, authService);
      const res = makeRes();
      await controller.viewPassportCopy(
        'client-1',
        'copy-1',
        'garbage',
        res as any,
      );
      expect(res.statusCode).toBe(401);
    });

    it('rejects a valid token whose owner lacks access to the client (403 IDOR guard)', async () => {
      const authService = {
        actorForFileToken: jest.fn().mockResolvedValue(T_USER),
      } as any;
      const clientsService = {
        verifyClientAccess: jest
          .fn()
          .mockRejectedValue(new ForbiddenException()),
        getPassportCopy: jest.fn(),
      } as any;
      const controller = new ClientsController(clientsService, authService);
      const res = makeRes();

      await controller.viewPassportCopy(
        'other-client',
        'copy-1',
        'valid',
        res as any,
      );

      expect(res.statusCode).toBe(403);
      expect(clientsService.verifyClientAccess).toHaveBeenCalledWith(
        'other-client',
        T_USER,
      );
      // Never reached file lookup / disk.
      expect(clientsService.getPassportCopy).not.toHaveBeenCalled();
    });
  });
});

// ── Audit round 2: lockout / oracle / abuse guard / file signatures / invoice IDOR ──

describe('Login lockout & account-state oracle (AuthService)', () => {
  let authService: AuthService;
  const activeUser: any = {
    id: 'u-active',
    email: 'active@example.com',
    isActive: true,
    emailVerified: true,
    tenantId: 't1',
    tenant: { id: 't1', name: 'Org', status: 'active' },

    firstName: 'A',
    lastName: 'A',
    role: { id: 'r', name: 'Translator', permissions: [] },
  };
  const inactiveUser: any = {
    id: 'u-inactive',
    email: 'inactive@example.com',
    isActive: false,
    emailVerified: true,
    tenantId: 't1',
    tenant: { id: 't1', name: 'Org', status: 'active' },

    firstName: 'I',
    lastName: 'I',
    role: { id: 'r', name: 'Translator', permissions: [] },
  };

  beforeAll(async () => {
    jest.spyOn(global, 'setInterval').mockReturnValue(0 as any);
    // Real time here (no Date.now mock) so lockout-window timing behaves normally.
    activeUser.password = await bcrypt.hash('Right!Pass1', 10);
    inactiveUser.password = await bcrypt.hash('Right!Pass1', 10);

    const userRepo = {
      findOne: ({ where }: any) =>
        Promise.resolve(
          [activeUser, inactiveUser].find(
            (u) => u.email === where.email || u.id === where.id,
          ) ?? null,
        ),
      update: () => Promise.resolve({ affected: 1 }),
    } as any;

    authService = new AuthService(
      userRepo,
      noopRepo,
      noopRepo,
      makeSessionRepo() as any,
      jwtService,
      configService,
      mailService,
      ...AUTH_EXTRAS,
    );
  });

  afterAll(() => jest.restoreAllMocks());

  it('does not leak account state to an attacker without the password (no oracle)', async () => {
    // Wrong password on a deactivated account → generic "Invalid credentials".
    await expect(
      authService.login(
        { email: 'inactive@example.com', password: 'wrong' },
        '9.9.9.9',
        'ua',
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('only reveals "deactivated" after the correct password', async () => {
    await expect(
      authService.login(
        { email: 'inactive@example.com', password: 'Right!Pass1' },
        '9.9.9.8',
        'ua',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('locks a source IP after repeated failures but NOT the victim from another IP', async () => {
    const attackerIp = '203.0.113.7';
    for (let i = 0; i < 5; i++) {
      await expect(
        authService.login(
          { email: 'active@example.com', password: 'nope' },
          attackerIp,
          'ua',
        ),
      ).rejects.toThrow(UnauthorizedException);
    }
    // 6th attempt from the attacker's IP is now locked out.
    await expect(
      authService.login(
        { email: 'active@example.com', password: 'nope' },
        attackerIp,
        'ua',
      ),
    ).rejects.toThrow(ForbiddenException);

    // The real user, from a DIFFERENT IP, is unaffected (no targeted-lockout DoS).
    const ok = await authService.login(
      { email: 'active@example.com', password: 'Right!Pass1' },
      '198.51.100.2',
      'ua',
    );
    expect(ok.accessToken).toBeDefined();
  });
});

describe('AbuseDetectionGuard (narrowed patterns + caps)', () => {
  const guard = new AbuseDetectionGuard();
  const ctx = (body: any, method = 'POST') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, body, ip: '1.1.1.1', url: '/x' }),
      }),
    }) as any;

  it('allows legitimate translator text that the old patterns falsely blocked', () => {
    const body = {
      notes:
        'Please delete from the list; total &amp; tax updated. Café coûte 5€ (&#233;).',
      name: 'one=2 online store',
      description: 'char(255) column note; alert (see below)',
    };
    expect(guard.canActivate(ctx(body))).toBe(true);
  });

  it('still blocks a clear SQL injection payload', () => {
    expect(() =>
      guard.canActivate(ctx({ q: "x' UNION SELECT password FROM users --" })),
    ).toThrow(BadRequestException);
  });

  it('still blocks a clear script-injection payload', () => {
    expect(() =>
      guard.canActivate(ctx({ notes: '<script>steal()</script>' })),
    ).toThrow(BadRequestException);
  });

  it('does not choke on deeply nested / large bodies (depth + node caps)', () => {
    let deep: any = 'leaf';
    for (let i = 0; i < 5000; i++) deep = { a: deep };
    expect(guard.canActivate(ctx(deep))).toBe(true);
  });
});

describe('File signature detection (magic bytes)', () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const pdf = Buffer.from('%PDF-1.7 rest', 'latin1');
  const zip = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const exe = Buffer.from([
    0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  it('identifies real types by content', () => {
    expect(sniffType(png)).toBe('png');
    expect(sniffType(jpeg)).toBe('jpeg');
    expect(sniffType(pdf)).toBe('pdf');
    expect(sniffType(zip)).toBe('zip'); // docx/xlsx/pptx
    expect(sniffType(exe)).toBeNull();
  });

  it('sniffImageMime accepts only PNG/JPEG and rejects spoofs', () => {
    expect(sniffImageMime(png)).toBe('image/png');
    expect(sniffImageMime(jpeg)).toBe('image/jpeg');
    expect(sniffImageMime(pdf)).toBeNull();
    // An SVG/HTML payload mislabeled image/png has no PNG signature → rejected.
    expect(
      sniffImageMime(Buffer.from('<svg onload=alert(1)>', 'latin1')),
    ).toBeNull();
  });
});

describe('Invoice create — IDOR guard on linked jobs', () => {
  it('rejects creating an invoice that links a job the caller cannot access', async () => {
    const clientRepo = { findOne: jest.fn().mockResolvedValue({ id: 'C' }) };
    const jobRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'J', clientId: 'C' }]),
      count: jest.fn().mockResolvedValue(1), // the job is in the caller's tenant
    };
    const settingsRepo = {
      getSettings: jest.fn().mockResolvedValue({ baseCurrency: 'USD' }),
    };
    const jobUserRepo = { findOne: jest.fn().mockResolvedValue(null) }; // no assignment → no access
    const dataSource = { transaction: jest.fn() };

    const svc = new InvoicesService(
      {} as any,
      {} as any,
      jobRepo as any,
      jobUserRepo as any,
      clientRepo as any,
      settingsRepo as any,
      dataSource as any,
    );

    await expect(
      svc.create(
        {
          clientId: 'C',
          issueDate: '2026-07-30',
          dueDate: '2026-08-30',
          items: [{ jobId: 'J', description: 'x', quantity: 1, unitPrice: 1 }],
        } as any,
        T_USER,
      ),
    ).rejects.toThrow(ForbiddenException);

    // Blocked before any persistence.
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('Sensitive columns are never loaded by default', () => {
  it('User.password and User.refreshToken are select: false', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === User,
    );
    for (const name of ['password', 'refreshToken']) {
      const col = cols.find((c) => c.propertyName === name);
      expect(col?.options.select).toBe(false);
    }
  });

  it('PATCH /platform/settings response never contains the SMTP password', async () => {
    const settingsService = {
      updatePlatformSettings: jest.fn().mockResolvedValue({
        smtpHost: 'smtp.example.com',
        smtpPass: 'hunter2',
      }),
    } as any;
    const controller = new PlatformController(
      {} as any,
      settingsService,
      {} as any,
    );
    const res = await controller.updateSettings({});
    expect(res).not.toHaveProperty('smtpPass');
    expect(res).toMatchObject({
      smtpHost: 'smtp.example.com',
      smtpPassSet: true,
    });
  });

  it('PATCH /settings never returns the Translate key or the tenant id', async () => {
    const settingsService = {
      updateTenantSettings: jest.fn().mockResolvedValue({
        companyName: 'X',
        tenantId: 't1',
        googleTranslateApiKey: 'secret-key',
      }),
    } as any;
    const controller = new SettingsController(settingsService);
    const res = await controller.updateSettings({}, T_ADMIN);
    expect(JSON.stringify(res)).not.toContain('secret-key');
    expect(res).not.toHaveProperty('tenantId');
    expect(res).toMatchObject({ googleTranslateKeySet: true });
  });
});

describe('View-only job assignments grant read, never write', () => {
  const viewOnly = {
    findOne: jest.fn().mockResolvedValue({ permissionLevel: 'view' }),
  };

  const openJobRepo = (status: string) =>
    ({
      manager: {
        findOne: jest.fn().mockResolvedValue({ id: 'job-1', status }),
      },
    }) as any;

  it('DocumentsService.verifyJobAccess: view passes, edit is refused', async () => {
    const svc = new DocumentsService(
      openJobRepo('in_progress'),
      {} as any,
      viewOnly as any,
    );
    await expect(svc.verifyJobAccess('job-1', T_USER)).resolves.toBeUndefined();
    await expect(svc.verifyJobAccess('job-1', T_USER, 'edit')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('DocumentsController write endpoints ask for edit access', async () => {
    const documentsService = {
      verifyDocumentAccess: jest.fn().mockResolvedValue({}),
      saveFieldValues: jest.fn(),
      remove: jest.fn(),
    } as any;
    const controller = new DocumentsController(documentsService, {} as any);
    await controller.saveFieldValues('doc-1', { values: [] }, T_USER);
    await controller.remove('doc-1', T_USER);
    for (const call of documentsService.verifyDocumentAccess.mock.calls) {
      expect(call[2]).toBe('edit');
    }
    expect(documentsService.verifyDocumentAccess).toHaveBeenCalledTimes(2);
  });

  it('InvoicesService.verifyInvoiceAccess(edit) only matches edit assignments', async () => {
    const jobUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const svc = new InvoicesService(
      { count: jest.fn().mockResolvedValue(1) } as any, // invoice in tenant
      {} as any,
      {} as any,
      jobUserRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      createdByUserId: 'someone-else',
      items: [{ jobId: 'job-1' }],
    } as any);
    await expect(
      svc.verifyInvoiceAccess('inv-1', T_USER, 'edit'),
    ).rejects.toThrow(ForbiddenException);
    expect(jobUserRepo.findOne.mock.calls[0][0].where).toMatchObject({
      userId: 'user-1',
      permissionLevel: 'edit',
    });
  });
});

describe('Roles are fixed', () => {
  it('the roles API only reads, and only the tenant roles', async () => {
    const roleRepo = { find: jest.fn().mockResolvedValue([]) };
    const svc = new RolesService(roleRepo as any, {} as any);
    await svc.findTenantRoles();
    const where = roleRepo.find.mock.calls[0][0].where;
    expect((where.name as FindOperator<string[]>).value).toEqual([
      'Admin',
      'Translator',
      'Viewer',
    ]);
    // Nothing to create, rename or delete — permissions come from the seed.
    expect((svc as any).create).toBeUndefined();
    expect((svc as any).update).toBeUndefined();
    expect((svc as any).remove).toBeUndefined();
  });
});

describe('UploadCleanupInterceptor', () => {
  const ctx = (req: any) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

  it('deletes the stored upload when the request fails', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'upl-')), 'f.bin');
    writeFileSync(path, 'x');
    const interceptor = new UploadCleanupInterceptor();
    const result = interceptor.intercept(ctx({ file: { path } }), {
      handle: () => throwError(() => new BadRequestException('nope')),
    });
    await expect(lastValueFrom(result)).rejects.toThrow(BadRequestException);
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(path)).toBe(false);
  });

  it('keeps the upload when the request succeeds', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'upl-')), 'f.bin');
    writeFileSync(path, 'x');
    const interceptor = new UploadCleanupInterceptor();
    const result = interceptor.intercept(ctx({ file: { path } }), {
      handle: () => of({ ok: true }),
    });
    await expect(lastValueFrom(result)).resolves.toEqual({ ok: true });
    expect(existsSync(path)).toBe(true);
  });
});

describe('Invites resolve their role up front', () => {
  const make = (role: unknown) => {
    const inviteRepo = {
      create: (e: any) => e,
      save: jest.fn((e: any) => Promise.resolve(e)),
    };
    const userRepo = {
      manager: { findOne: jest.fn().mockResolvedValue(role) },
    };
    const svc = new AuthService(
      userRepo as any,
      inviteRepo as any,
      noopRepo,
      noopRepo,
      jwtService,
      configService,
      mailService,
      ...AUTH_EXTRAS,
    );
    return { svc, inviteRepo, userRepo };
  };

  it('no role picked → stores the Translator role id', async () => {
    const { svc, inviteRepo, userRepo } = make({ id: 'r-translator' });
    await svc.createInvite('new@example.com', undefined, 't1');
    expect(userRepo.manager.findOne.mock.calls[0][1]).toEqual({
      where: { name: 'Translator' },
    });
    expect(inviteRepo.save.mock.calls[0][0]).toMatchObject({
      roleId: 'r-translator',
      tenantId: 't1', // the invitee joins the inviting admin's organization
    });
  });

  it('a picked role must be one of the tenant roles (never Platform Admin)', async () => {
    const { svc, userRepo } = make({ id: 'r-admin' });
    await svc.createInvite('new@example.com', 'r-admin', 't1');
    const where = userRepo.manager.findOne.mock.calls[0][1].where;
    expect(where.id).toBe('r-admin');
    expect((where.name as FindOperator<string[]>).value).not.toContain(
      'Platform Admin',
    );
  });

  it('unknown role id → 400 at invite time, nothing stored', async () => {
    const { svc, inviteRepo } = make(null);
    await expect(
      svc.createInvite('new@example.com', 'no-such-role', 't1'),
    ).rejects.toThrow(BadRequestException);
    expect(inviteRepo.save).not.toHaveBeenCalled();
  });
});

describe('Locked jobs (Batch C)', () => {
  it('document writes on a delivered job are refused, even for admins', async () => {
    const svc = new DocumentsService(
      {
        manager: {
          findOne: jest.fn().mockResolvedValue({ status: 'delivered' }),
        },
      } as any,
      {} as any,
      {} as any,
    );
    await expect(svc.verifyJobAccess('job-1', T_ADMIN, 'edit')).rejects.toThrow(
      BadRequestException,
    );
    // reading a locked job's documents is still fine
    await expect(
      svc.verifyJobAccess('job-1', T_ADMIN),
    ).resolves.toBeUndefined();
  });
});

describe('Data integrity (Batch B)', () => {
  it('saveFieldValues refuses values for another template and writes nothing', async () => {
    const transaction = jest.fn();
    const svc = new DocumentsService(
      {} as any,
      { manager: { transaction } } as any,
      {} as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      template: { fields: [{ id: 'f-own' }] },
    } as any);
    await expect(
      svc.saveFieldValues('doc-1', [
        { templateFieldId: 'f-own', value: 'a' },
        { templateFieldId: 'f-foreign', value: 'b' },
      ] as any),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saveFieldValues replaces values inside one transaction', async () => {
    const manager = {
      delete: jest.fn(),
      save: jest.fn(),
      create: (_e: unknown, o: unknown) => o,
    };
    const svc = new DocumentsService(
      {} as any,
      { manager: { transaction: (fn: any) => fn(manager) } } as any,
      {} as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      template: { fields: [{ id: 'f-own' }] },
    } as any);
    await svc.saveFieldValues('doc-1', [
      { templateFieldId: 'f-own', value: 'a' },
    ]);
    expect(manager.delete).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith([
      expect.objectContaining({ documentId: 'doc-1', value: 'a' }),
    ]);
  });

  it('invoice update writes scalars with update(), never save() (cascade re-inserts old items)', async () => {
    const manager = {
      delete: jest.fn(),
      save: jest.fn(),
      create: (_e: unknown, o: unknown) => o,
      update: jest.fn(),
      // tenant settings-row lock taken before items are replaced
      createQueryBuilder: () => {
        const qb = {
          setLock: () => qb,
          where: () => qb,
          getOne: () => Promise.resolve({ tenantId: 't1' }),
        };
        return qb;
      },
    };
    const invoiceRepo = { save: jest.fn() };
    const svc = new InvoicesService(
      invoiceRepo as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      {} as any,
      { transaction: (fn: any) => fn(manager) } as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 'inv-1',
      tenantId: 't1',
      status: 'draft',
      clientId: 'C',
      taxRate: 0,
      items: [{ description: 'old', quantity: 1, unitPrice: 1 }],
    } as any);
    await svc.update(
      'inv-1',
      { items: [{ description: 'new', quantity: 2, unitPrice: 3 }] },
      T_ADMIN,
    );
    expect(invoiceRepo.save).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      'inv-1',
      expect.objectContaining({ subtotal: 6, total: 6 }),
    );
  });

  it('invoice update refuses an empty item list', async () => {
    const svc = new InvoicesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(svc, 'findOne')
      .mockResolvedValue({ status: 'draft', items: [] } as any);
    await expect(
      svc.update('inv-1', { items: [] } as any, T_ADMIN),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Invoice PDF (Unicode fonts + pagination)', () => {
  it('renders Arabic/Cyrillic text over several pages with embedded Noto fonts', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      description:
        i % 2 === 0
          ? `ترجمة وثيقة رسمية رقم ${i} — Перевод`
          : `Line ${i}: certified translation with a fairly long description that wraps onto a second line`,
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
      sortOrder: 60 - i,
    }));
    const invoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-9999',
      status: 'draft',
      issueDate: '2026-10-26',
      dueDate: '2026-11-25',
      currency: 'SAR',
      subtotal: 600,
      taxRate: 0,
      taxAmount: 0,
      total: 600,
      paidAmount: null,
      notes: 'الدفع خلال ٣٠ يوماً\nPayment within 30 days.',
      createdByUserId: null,
      client: { name: 'شركة الترجمة', addresses: [], emails: [] },
      items,
    };
    const svc = new InvoiceExportService(
      { findOne: jest.fn().mockResolvedValue(invoice) } as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { getSettings: jest.fn().mockResolvedValue({ companyName: '' }) } as any,
    );
    const { filePath } = await svc.exportPdf('inv-1');
    try {
      const pdf = readFileSync(filePath).toString('latin1');
      const pages = Number(
        /\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf)?.[1],
      );
      expect(pages).toBeGreaterThan(1);
      expect(pdf).toMatch(/NotoSansArabic/);
      expect(pdf).toMatch(/NotoSans-/);
      expect(pdf).not.toMatch(/Helvetica/);
      // items printed in sortOrder (the last item has sortOrder 1)
      expect(invoice.items[0].sortOrder).toBe(1);
    } finally {
      unlinkSync(filePath);
    }
  });
});

describe('Invoice status vs payments', () => {
  const make = (invoice: object) => {
    const svc = new InvoicesService(
      { save: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue(invoice as any);
    return svc;
  };

  it('"paid" can only be reached by recording payments', async () => {
    const svc = make({ status: 'sent', paidAmount: null, items: [] });
    await expect(svc.updateStatus('inv-1', 'paid')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('an invoice with payments cannot be cancelled', async () => {
    const svc = make({ status: 'sent', paidAmount: '30.00', items: [] });
    await expect(svc.updateStatus('inv-1', 'cancelled')).rejects.toThrow(
      /payments recorded/,
    );
  });
});

describe('Client IP behind Cloudflare', () => {
  const req = (peer: string, headers: Record<string, string>) =>
    ({ socket: { remoteAddress: peer }, headers }) as any;

  it('uses CF-Connecting-IP when the request came Cloudflare → IIS (loopback)', () => {
    expect(
      cloudflareClientIp(
        req('::1', {
          'x-forwarded-for': '198.51.100.7, 162.158.10.20:44321',
          'cf-connecting-ip': '198.51.100.7',
        }),
      ),
    ).toBe('198.51.100.7');
  });

  it('ignores CF-Connecting-IP on a direct hit to the origin (spoofed headers)', () => {
    // Attacker 203.0.113.5 → IIS directly: the hop IIS records is the attacker.
    expect(
      cloudflareClientIp(
        req('127.0.0.1', {
          'x-forwarded-for': '162.158.1.1, 203.0.113.5:5000',
          'cf-connecting-ip': '1.2.3.4',
        }),
      ),
    ).toBeNull();
  });

  it('ignores it when the TCP peer is not the local proxy', () => {
    expect(
      cloudflareClientIp(
        req('162.158.10.20', {
          'x-forwarded-for': '162.158.10.20',
          'cf-connecting-ip': '1.2.3.4',
        }),
      ),
    ).toBeNull();
  });

  it('normalizes ports, brackets and IPv4-mapped addresses', () => {
    expect(normalizeIp('1.2.3.4:80')).toBe('1.2.3.4');
    expect(normalizeIp('[2606:4700::1]:443')).toBe('2606:4700::1');
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeIp('not-an-ip')).toBeNull();
  });
});

describe('Search LIKE escaping (like.ts)', () => {
  it('matches %, _ and backslash literally', () => {
    expect(likeContains('50%_off')).toBe('%50\\%\\_off%');
    expect(likeContains('a\\b')).toBe('%a\\\\b%');
  });
});

describe('isCloudflareIp', () => {
  it('knows Cloudflare v4 and v6 ranges', () => {
    expect(isCloudflareIp('162.158.10.20')).toBe(true);
    expect(isCloudflareIp('2606:4700::1')).toBe(true);
    expect(isCloudflareIp('8.8.8.8')).toBe(false);
    expect(isCloudflareIp(null)).toBe(false);
  });
});
