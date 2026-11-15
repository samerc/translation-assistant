import { NotificationsService } from './notifications.service.js';
import type { Notification } from './entities/notification.entity.js';

/** Reminder emails: one per person, only for people who want them, in active organizations. */
describe('NotificationsService.emailReminders', () => {
  const n = (userId: string, title: string) =>
    ({
      userId,
      title,
      message: `${title} message`,
      link: '/jobs/1',
    }) as Notification;

  function setup(users: object[]) {
    const find = jest.fn().mockResolvedValue(users);
    const sendReminders = jest.fn().mockResolvedValue(undefined);
    const repo = { manager: { find } };
    const service = new NotificationsService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { sendReminders } as never,
    );
    return { service, find, sendReminders };
  }

  it('groups by person and skips inactive organizations', async () => {
    const { service, find, sendReminders } = setup([
      {
        id: 'u1',
        email: 'a@x.test',
        firstName: 'Rana',
        tenant: { status: 'active' },
      },
      {
        id: 'u2',
        email: 'b@x.test',
        firstName: 'Omar',
        tenant: { status: 'suspended' },
      },
    ]);
    const sent = await service.emailReminders([
      n('u1', 'Deadline approaching'),
      n('u1', 'Invoice overdue'),
      n('u2', 'Deadline approaching'),
    ]);
    expect(sent).toBe(1);
    expect(sendReminders).toHaveBeenCalledTimes(1);
    expect(sendReminders.mock.calls[0][0]).toBe('a@x.test');
    expect(sendReminders.mock.calls[0][2]).toHaveLength(2);
    // Only active people who keep reminders on are asked for.
    const where = (
      find.mock.calls[0] as [unknown, { where: Record<string, unknown> }]
    )[1].where;
    expect(where.isActive).toBe(true);
    expect(where.emailReminders).toBe(true);
  });

  it('does nothing without reminders, and survives a failed send', async () => {
    const { service, find, sendReminders } = setup([
      {
        id: 'u1',
        email: 'a@x.test',
        firstName: 'Rana',
        tenant: { status: 'active' },
      },
    ]);
    expect(await service.emailReminders([])).toBe(0);
    expect(find).not.toHaveBeenCalled();
    sendReminders.mockRejectedValueOnce(new Error('SMTP down'));
    expect(await service.emailReminders([n('u1', 'Invoice overdue')])).toBe(0);
  });
});
