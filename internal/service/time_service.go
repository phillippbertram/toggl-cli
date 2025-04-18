package service

import (
	"log"
	"time"

	"phillipp.io/toggl-cli/internal/api"
)

type TimeService struct {
	api *api.Api
}

func NewTimeService(api *api.Api) *TimeService {
	return &TimeService{api: api}
}

type GetTimeEntriesOpts struct {
	Since  *time.Time
	Before *time.Time

	ClientName *string

	// YYYY-MM-DD
	StartDate *time.Time

	// YYYY-MM-DD
	EndDate *time.Time
}

func (s *TimeService) GetTimeEntries(opts *GetTimeEntriesOpts) ([]TimeEntry, error) {
	entries, err := s.api.GetTimeEntries(&api.GetTimeEntriesOpts{
		Since:     opts.Since,
		Before:    opts.Before,
		StartDate: opts.StartDate,
		EndDate:   opts.EndDate,
	})

	if err != nil {
		return nil, err
	}

	enrichedEntries, err := s.getEnrichedTimeEntries(entries)
	if err != nil {
		return nil, err
	}
	if opts.ClientName != nil && *opts.ClientName != "" {
		entriesByClient := FilterByClientName(enrichedEntries, *opts.ClientName)
		return entriesByClient, nil
	}

	return enrichedEntries, nil
}

func (s *TimeService) GetActiveTimeEntry() (*TimeEntry, error) {
	activeEntry, err := s.api.GetActiveTimeEntry()
	if err != nil {
		return nil, err
	}

	if activeEntry == nil {
		return nil, nil
	}

	return s.getEnrichedTimeEntry(*activeEntry)
}

func (s *TimeService) GetGroupedTimeEntries(opts *GetTimeEntriesOpts) ([]GroupedEntry, error) {
	entries, err := s.GetTimeEntries(opts)
	if err != nil {
		return nil, err
	}

	entries = IgnoreRunningEntries(entries)

	// TODO: move this to an utils function
	// Grouped entries map to quickly lookup existing groups
	groupedEntriesMap := make(map[int]*GroupedEntry)

	for _, entry := range entries {
		groupID := entry.Project.ID
		group, exists := groupedEntriesMap[groupID]

		if !exists {
			group = &GroupedEntry{
				Project: entry.Project,
				Client:  entry.Client,
				Entries: []TimeEntry{},
			}
			groupedEntriesMap[groupID] = group
		}

		group.Entries = append(group.Entries, entry)
	}

	// Convert the map of groups to a slice
	groupedEntries := make([]GroupedEntry, 0, len(groupedEntriesMap))
	for _, group := range groupedEntriesMap {
		groupedEntries = append(groupedEntries, *group)
	}

	return groupedEntries, nil
}

func (s *TimeService) getEnrichedTimeEntry(entry api.TimeEntryDto) (*TimeEntry, error) {
	entries := []api.TimeEntryDto{entry}
	enrichedEntries, err := s.getEnrichedTimeEntries(entries)
	if err != nil {
		return nil, err
	}

	if len(enrichedEntries) == 0 {
		return nil, nil
	}

	return &enrichedEntries[0], nil
}

func (s *TimeService) getEnrichedTimeEntries(entries []api.TimeEntryDto) ([]TimeEntry, error) {
	projects := []api.ProjectDto{}
	clients := []api.ClientDto{}

	enrichedEntries := []TimeEntry{}
	for _, entry := range entries {

		// read from cache
		project := api.GetProjectById(projects, entry.ProjectId)
		if project == nil && entry.ProjectId != nil {
			// fetch from API
			newProject, err := s.api.GetProjectById(entry.WorkspaceId, *entry.ProjectId)
			project = newProject
			if err != nil {
				log.Printf("Failed to get project: %v\n", err)
			}
			if project != nil {
				projects = append(projects, *project)
			}
		}

		var client *api.ClientDto
		if project != nil {
			// read from cache
			client = api.GetClientById(clients, project.ClientId)
			if client == nil && project.ClientId != nil {
				// fetch from API
				freshClient, err := s.api.GetClientById(entry.WorkspaceId, *project.ClientId)
				client = freshClient
				if err != nil {
					log.Printf("failed to get client: %v", err)
				}
				if client != nil {
					clients = append(clients, *client)
				} else {
					log.Printf("client not found: %d", *project.ClientId)
				}
			}
		}

		enrichedEntries = append(enrichedEntries, TimeEntry{
			TimeEntry: entry,
			Project:   project,
			Client:    client,
		})
	}

	return enrichedEntries, nil
}
