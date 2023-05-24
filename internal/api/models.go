package api

import "time"

type Project struct {
	// Project ID
	ID int `json:"id"`

	// Project name
	Name string `json:"name"`

	// Client ID. Can be null if client was not provided or client was later deleted
	ClientId *int `json:"client_id"`
}

type Client struct {
	// Client ID
	ID int `json:"id"`

	// Client name
	Name string `json:"name"`
}

type TimeEntry struct {

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
