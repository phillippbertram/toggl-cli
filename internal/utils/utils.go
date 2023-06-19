package utils

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

const (
	DATE_FORMAT      = time.TimeOnly
	DATE_TIME_FORMAT = time.RFC3339
)

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

func GetApiToken(cmd *cobra.Command, bindToken *string) error {
	token, err := cmd.Flags().GetString("token")
	if err != nil {
		return err
	}

	if token == "" {
		token = os.Getenv("TOGGL_API_TOKEN")
	}

	if token == "" {
		return fmt.Errorf("no API token provided")
	}

	*bindToken = token
	return nil
}
