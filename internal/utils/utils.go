package utils

import "time"

func GetFirstDayOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month, 1, 0, 0, 0, 0, now.Location())
}

func GetLastDayOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month+1, 0, 0, 0, 0, 0, now.Location())
}
