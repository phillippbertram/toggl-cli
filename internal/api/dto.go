package api

import "time"

// https://developers.track.toggl.com/docs/api/me#get-me
type UserDto struct {
	ID                 int    `json:"id"`
	Email              string `json:"email"`
	FullName           string `json:"fullname"`
	DefaultWorkspaceID int    `json:"default_workspace_id"`
}

type ProjectDto struct {
	// Project ID
	ID int `json:"id"`

	// Project name
	Name string `json:"name"`

	// Client ID. Can be null if client was not provided or client was later deleted
	ClientId *int `json:"client_id"`
}

type ClientDto struct {
	// Client ID
	ID int `json:"id"`

	// Client name
	Name string `json:"name"`
}

type TimeEntryDto struct {

	// Time Entry ID
	ID int `json:"id"`

	// Project ID. Can be null if project was not provided or project was later deleted
	ProjectId *int `json:"project_id"`

	// Workspace ID, where the time entry was recorded
	WorkspaceId int `json:"workspace_id"`

	// When was last updated
	At string `json:"at"`

	// Time Entry description, null if not provided at creation/update
	Description *string `json:"description"`

	// Time entry duration. For running entries should be negative, preferable -1
	Duration int `json:"duration"`

	// Start time in UTC
	Start time.Time `json:"start"`

	// Stop time in UTC, can be null if it's still running or created with "duration" and "duronly" fields
	Stop *string `json:"stop"`

	// Tag names, null if tags were not provided or were later deleted
	Tags []string `json:"tags"`
}

// https://developers.track.toggl.com/docs/api/time_entries#post-timeentries
type CreateTypeEntryRequestDto struct {
	ProjectID *int `json:"project_id"`

	// Must be provided when creating a time entry and should identify the service/application used to create it
	CreatedWith string `json:"created_with"`

	// Start time in UTC, required for creation. Format: 2006-01-02T15:04:05Z
	Start string `json:"start"`

	// Workspace ID, required
	WorkspaceID int `json:"workspace_id"`

	// Time entry description, optional
	Description string `json:"description"`

	// Time entry duration. For running entries should be negative, preferable -1
	Duration int `json:"duration"`
}
