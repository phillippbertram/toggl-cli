package utils

import "time"

func GetStartOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month, 1, 0, 0, 0, 0, now.Location())
}

func GetLastDayOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month+1, 0, 0, 0, 0, 0, now.Location())
}

func GetEndOfDayFor(date time.Time) time.Time {
	return time.Date(date.Year(), date.Month(), date.Day(), 23, 59, 59, 0, date.Location()).Local()
}

func GetEndOfTodayDay() time.Time {
	now := time.Now()
	return GetEndOfDayFor(now)
}

func GetDaysBetween(start time.Time, end time.Time) []time.Time {
	days := []time.Time{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		days = append(days, d)
	}
	return days
}
