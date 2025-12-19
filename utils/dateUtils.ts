
import { format, getDaysInMonth, addDays, isSunday } from 'date-fns';

export const getDaysInMonthArray = (year: number, month: number): Date[] => {
  const startDate = new Date(year, month);
  const daysCount = getDaysInMonth(startDate);
  
  const days: Date[] = [];
  for (let i = 0; i < daysCount; i++) {
    days.push(addDays(startDate, i));
  }
  return days;
};

export const formatDateKey = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

export const isDateSunday = (date: Date): boolean => {
  return isSunday(date);
};

export const startOfDay = (date: Date | number | string): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const formatDecimalHours = (decimalHours: number | undefined): string => {
  if (!decimalHours && decimalHours !== 0) return '-';
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  
  if (hours === 0 && minutes === 0) return '0m';
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
