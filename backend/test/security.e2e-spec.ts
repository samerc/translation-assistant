import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy.js';
import { JwtRefreshStrategy } from '../src/modules/auth/strategies/jwt-refresh.strategy.js';
import { DocumentsController } from '../src/modules/documents/documents.controller.js';
import { ClientsController } from '../src/modules/clients/clients.controller.js';

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
    (({ 'jwt.secret': TEST_SECRET, 'jwt.accessTokenTtl': 900 }) as Record<string, unknown>)[key],
} as any;
const jwtService = new JwtService({ secret: TEST_SECRET });

// ── In-memory repository fakes ──
function matches(entity: any, where: any): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (cond instanceof FindOperator) {
      if (cond.type === 'moreThan') return entity[k] > (cond.value as any);
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
    findOne: ({ where }: any) => Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    find: ({ where }: any) => Promise.resolve(rows.filter((r) => matches(r, where))),
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
      firstName: 'Alice',
      lastName: 'A',
      role: { id: 'r1', name: 'Translator', permissions: [] },
    };

    const userRepo = {
      findOne: ({ where }: any) =>
        Promise.resolve(
          (where.id && where.id === user.id) || (where.email && where.email === user.email)
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

  it('refresh rotates the token and invalidates the old one (one-time use)', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );

    const rotated = await authService.refreshTokens(user.id, login.refreshToken, IP, UA);
    expect(rotated.refreshToken).not.toEqual(login.refreshToken);
    expect(jwtService.verify(rotated.refreshToken).type).toBe('refresh');

    // Re-using the OLD refresh token must now fail (rotation replaced the hash).
    await expect(authService.refreshTokens(user.id, login.refreshToken, IP, UA)).rejects.toThrow(
      ForbiddenException,
    );

    // The NEW token still works.
    const again = await authService.refreshTokens(user.id, rotated.refreshToken, IP, UA);
    expect(again.refreshToken).toBeDefined();
  });

  it('rejects an unknown / forged refresh token', async () => {
    const forged = await jwtService.signAsync({ sub: user.id, type: 'refresh' });
    await expect(authService.refreshTokens(user.id, forged, IP, UA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('revokes the session on IP/device fingerprint mismatch', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );

    // Same token, different IP → treated as suspicious, session revoked.
    await expect(
      authService.refreshTokens(user.id, login.refreshToken, '203.0.113.9', UA),
    ).rejects.toThrow(ForbiddenException);

    // Even from the correct IP, the now-revoked session can't refresh.
    await expect(authService.refreshTokens(user.id, login.refreshToken, IP, UA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('logout revokes the session so its refresh token stops working', async () => {
    const login = await authService.login(
      { email: 'alice@example.com', password: 'Str0ng!Pass' },
      IP,
      UA,
    );
    await authService.logout(user.id, login.refreshToken);
    await expect(authService.refreshTokens(user.id, login.refreshToken, IP, UA)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('Token-type enforcement (passport strategies)', () => {
  const activeUser = {
    id: 'user-1',
    isActive: true,
    role: { name: 'Translator', permissions: [] },
  };
  const userRepo = {
    findOne: ({ where }: any) =>
      Promise.resolve(where.id === activeUser.id ? activeUser : null),
  } as any;

  const jwtStrategy = new JwtStrategy(configService, userRepo);
  const refreshStrategy = new JwtRefreshStrategy(configService);

  it('JwtStrategy (access) refuses a refresh-type token', async () => {
    await expect(jwtStrategy.validate({ sub: 'user-1', type: 'refresh' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('JwtStrategy accepts a valid access token for an active user', async () => {
    const u = await jwtStrategy.validate({ sub: 'user-1', type: 'access' });
    expect(u.id).toBe('user-1');
  });

  it('JwtStrategy rejects an unknown / inactive user', async () => {
    await expect(jwtStrategy.validate({ sub: 'ghost', type: 'access' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('JwtRefreshStrategy refuses an access-type token', async () => {
    const req = { cookies: { refresh_token: 'x' }, get: () => undefined } as any;
    await expect(refreshStrategy.validate(req, { sub: 'user-1', type: 'access' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('JwtRefreshStrategy accepts a refresh token and surfaces it from the cookie', async () => {
    const req = { cookies: { refresh_token: 'cookie-token' }, get: () => undefined } as any;
    const result = await refreshStrategy.validate(req, { sub: 'user-1', type: 'refresh' });
    expect(result.refreshToken).toBe('cookie-token');
    expect(result.type).toBe('refresh');
  });
});

describe('IDOR guards (controllers)', () => {
  const nonAdmin = { id: 'user-1', role: { name: 'Translator' } } as any;

  describe('Document create — cloning requires access to the source document', () => {
    it('blocks cloning a document the user cannot access', async () => {
      const documentsService = {
        verifyJobAccess: jest.fn().mockResolvedValue(undefined),
        verifyDocumentAccess: jest.fn().mockRejectedValue(new ForbiddenException()),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      } as any;
      const controller = new DocumentsController(documentsService, {} as any);

      await expect(
        controller.create({ jobId: 'job-1', clonedFromId: 'secret-doc' } as any, nonAdmin),
      ).rejects.toThrow(ForbiddenException);

      // Access to the clone source was checked, and creation never happened.
      expect(documentsService.verifyDocumentAccess).toHaveBeenCalledWith(
        'secret-doc',
        'user-1',
        false,
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
        verifyFileToken: jest.fn(() => {
          throw new Error('bad token');
        }),
      } as any;
      const controller = new ClientsController({} as any, authService);
      const res = makeRes();
      await controller.viewPassportCopy('client-1', 'copy-1', 'garbage', res as any);
      expect(res.statusCode).toBe(401);
    });

    it('rejects a valid token whose owner lacks access to the client (403 IDOR guard)', async () => {
      const authService = {
        verifyFileToken: jest.fn(() => 'user-1'),
        getProfile: jest.fn().mockResolvedValue({ id: 'user-1', role: { name: 'Translator' } }),
      } as any;
      const clientsService = {
        verifyClientAccess: jest.fn().mockRejectedValue(new ForbiddenException()),
        getPassportCopy: jest.fn(),
      } as any;
      const controller = new ClientsController(clientsService, authService);
      const res = makeRes();

      await controller.viewPassportCopy('other-client', 'copy-1', 'valid', res as any);

      expect(res.statusCode).toBe(403);
      expect(clientsService.verifyClientAccess).toHaveBeenCalledWith('other-client', 'user-1', false);
      // Never reached file lookup / disk.
      expect(clientsService.getPassportCopy).not.toHaveBeenCalled();
    });
  });
});
