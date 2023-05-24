package api

import (
	"time"
)

func ContainsProject(projects []Project, projectId *int) *Project {
	if projectId == nil {
		return nil
	}
	for _, project := range projects {
		if project.ID == *projectId {
			return &project
		}
	}
	return nil
}

func ContainsClient(clients []Client, clientId *int) *Client {
	if clientId == nil {
		return nil
	}
	for _, client := range clients {
		if client.ID == *clientId {
			return &client
		}
	}
	return nil
}

func FilterEntriesForWorkspace(entries []TimeEntry, workspaceId int) []TimeEntry {
	filtered := []TimeEntry{}
	for _, entry := range entries {
		if entry.WorkspaceId == workspaceId {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

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
