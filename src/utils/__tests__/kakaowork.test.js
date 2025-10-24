import { buildMeetingReminderMessages } from '../kakaowork';

describe('buildMeetingReminderMessages', () => {
  const targetDate = new Date('2024-03-07T00:00:00Z');
  const timeZone = 'Asia/Seoul';

  it('builds reminder from Firestore Timestamp-like objects', () => {
    const timestampLike = { seconds: Math.floor(targetDate.getTime() / 1000) };
    const reminders = buildMeetingReminderMessages([
      { id: 'test', name: '홍길동', eventDate: timestampLike },
    ], { date: targetDate, timeZone });

    expect(reminders).toHaveLength(1);
    expect(reminders[0].lines[0]).toContain('일정:');
  });

  it('builds reminder from objects exposing toDate()', () => {
    const reminders = buildMeetingReminderMessages([
      {
        id: 'test2',
        name: '이몽룡',
        eventDate: { toDate: () => new Date('2024-03-07T09:00:00+09:00') },
      },
    ], { date: targetDate, timeZone });

    expect(reminders).toHaveLength(1);
    expect(reminders[0].lines[0]).toContain('일정:');
  });
});