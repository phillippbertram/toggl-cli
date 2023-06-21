package service

import (
	"os"
	"time"

	"github.com/jedib0t/go-pretty/table"
	"phillipp.io/toggl-cli/internal/utils"
)

func PrettyPrintTimeEntry(enrichedEntry *TimeEntry) {
	if enrichedEntry == nil {
		return
	}

	entry := enrichedEntry.TimeEntry

	projectName := ""
	if enrichedEntry.Project != nil {
		projectName = enrichedEntry.Project.Name
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
	if entry.Duration < -1 {
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
		projectName,
		entry.Start.Format(utils.DATE_TIME_FORMAT),
		projectStop,
		duration,
		status,
	})
	t.Render()
}
