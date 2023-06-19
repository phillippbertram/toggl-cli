package api

import (
	"fmt"
	"os"
	"time"

	"github.com/jedib0t/go-pretty/table"
)

func GetProjectById(projects []ProjectDto, projectId *int) *ProjectDto {
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

func GetClientById(clients []ClientDto, clientId *int) *ClientDto {
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

func FilterEntriesForWorkspace(entries []TimeEntryDto, workspaceId int) []TimeEntryDto {
	filtered := []TimeEntryDto{}
	for _, entry := range entries {
		if entry.WorkspaceId == workspaceId {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func PrettyPrintTimeEntry(entry *TimeEntryDto) {
	if entry == nil {
		return
	}

	projectId := ""
	if entry.ProjectId != nil {
		projectId = fmt.Sprintf("%d", *entry.ProjectId)
	}

	projectStop := ""
	if entry.Stop != nil {
		projectStop = entry.Stop.Format("2006-01-02 15:04:05")
	}

	description := ""
	if entry.Description != nil {
		description = *entry.Description
	}

	duration := (time.Duration(entry.Duration) * time.Second).String()
	if entry.Duration == -1 {
		duration = "running"
	}

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"ID", "Description", "Project", "Start", "End", "Duration"})
	t.AppendRow(table.Row{
		entry.ID,
		description,
		projectId,
		entry.Start.Format("2006-01-02 15:04:05"),
		projectStop,
		duration,
	})
	t.Render()
}
