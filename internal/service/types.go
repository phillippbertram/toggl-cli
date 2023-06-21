package service

import "phillipp.io/toggl-cli/internal/api"

type TimeEntry struct {
	TimeEntry api.TimeEntryDto
	Project   *api.ProjectDto
	Client    *api.ClientDto
}
