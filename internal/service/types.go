package service

import (
	"time"

	"phillipp.io/toggl-cli/internal/api"
)

type TimeEntry struct {
	TimeEntry api.TimeEntryDto
	Project   *api.ProjectDto
	Client    *api.ClientDto
}

type GroupedEntry struct {
	Project *api.ProjectDto
	Client  *api.ClientDto
	Entries []TimeEntry
}

type TimeStatistics struct {
	TotalDuration time.Duration
	EarliestEntry *TimeEntry
	LatestEntry   *TimeEntry
}
