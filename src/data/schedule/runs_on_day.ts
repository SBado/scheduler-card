
import { Schedule, TWeekday } from '../../types';

const WEEKDAY_TO_JS_DAY: Record<string, number> = {
  [TWeekday.Sunday]: 0,
  [TWeekday.Monday]: 1,
  [TWeekday.Tuesday]: 2,
  [TWeekday.Wednesday]: 3,
  [TWeekday.Thursday]: 4,
  [TWeekday.Friday]: 5,
  [TWeekday.Saturday]: 6,
};

const WORKDAYS = new Set([1, 2, 3, 4, 5]);
const WEEKEND_DAYS = new Set([0, 6]);


export const scheduleRunsOnDay = (schedule: Schedule, jsDay: number): boolean =>
  schedule.entries.some((entry) =>
    entry.weekdays.some((wd) => {
      switch (wd) {
        case TWeekday.Daily: return true;
        case TWeekday.Workday: return WORKDAYS.has(jsDay);
        case TWeekday.Weekend: return WEEKEND_DAYS.has(jsDay);
        default: return WEEKDAY_TO_JS_DAY[wd] === jsDay;
      }
    })
  );