package api

import (
	"fmt"
	"os"
	"time"

	"github.com/jedib0t/go-pretty/table"
	"phillipp.io/toggl-cli/internal/utils"
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

	projectStop := "-"
	if entry.Stop != nil {
		projectStop = entry.Stop.Format(utils.DATE_TIME_FORMAT)
	}

	description := "-"
	if entry.Description != nil {
		description = *entry.Description
	}

	duration := time.Duration(entry.Duration) * time.Second
	if entry.Duration == -1 {
		duration = time.Since(entry.Start)
	}
	duration = duration.Round(time.Second)

	status := "running"
	if entry.Stop != nil {
		status = "stopped"
	}

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"ID", "Description", "Project", "Start", "End", "Duration", "Status"})
	t.AppendRow(table.Row{
		entry.ID,
		description,
		projectId,
		entry.Start.Format(utils.DATE_TIME_FORMAT),
		projectStop,
		duration,
		status,
	})
	t.Render()
}
