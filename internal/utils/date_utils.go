package utils

import (
	"time"
)

const (
	DATE_FORMAT      = time.DateOnly
	DATE_TIME_FORMAT = time.RFC3339
)

func GetStartOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month, 1, 0, 0, 0, 0, now.Location())
}

// TODO: make start of week configurable locally or get information from api?
func GetStartOfWeek() time.Time {
	now := time.Now()
	year, month, day := now.Date()
	weekday := now.Weekday()

	// monday is start of week
	offset := int(weekday - time.Monday)
	if offset < 0 {
		offset = 6
	}

	return time.Date(year, month, day-offset, 0, 0, 0, 0, now.Location())
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

func ParseDateTime(str string, useEndOfDay bool) (time.Time, error) {
	formats := []string{
		time.DateOnly,
		time.DateTime,
		time.RFC3339,
		time.DateOnly + " 15:04",
	}

	var parsedTime time.Time
	var err error

	for _, format := range formats {
		parsedTime, err = time.Parse(format, str)
		if err == nil {
			break
		}
	}

	if err != nil {
		return time.Time{}, err
	}

	if useEndOfDay && parsedTime.Hour() == 0 && parsedTime.Minute() == 0 && parsedTime.Second() == 0 {
		parsedTime = parsedTime.Add(time.Hour*23 + time.Minute*59 + time.Second*59)
	}

	return parsedTime, nil
}
