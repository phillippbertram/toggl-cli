package service

import (
	"os"
	"time"

	"github.com/jedib0t/go-pretty/table"
)

func PrettyPrintTimeEntries(enrichedEntries []TimeEntry) {

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Description", "Project", "Start", "End", "Duration"})

	for _, rEntry := range enrichedEntries {
		entry := rEntry.TimeEntry

		var description string
		if entry.Description != nil {
			description = *entry.Description
		} else {
			description = "<NO_DESCRIPTION>"
		}
		// max length 10
		if len(description) > 30 {
			description = description[:30]
			description += "..."
		}

		startDate := entry.Start.Local().Format(time.DateTime)

		var endDate string
		if entry.Stop != nil {
			endDate = entry.Stop.Local().Format(time.DateTime)
		} else {
			endDate = "-"
		}

		var duration string
		if entry.Duration >= 0 {
			duration = (time.Duration(entry.Duration) * time.Second).String()
		} else {
			duration = time.Since(entry.Start).String()
		}

		var projectName string
		if rEntry.Project != nil {
			projectName = rEntry.Project.Name
		} else {
			projectName = "<NO_PROJECT>"
		}

		t.AppendRow(table.Row{
			// entry.ID,
			description,
			projectName,
			startDate,
			endDate,
			duration,
		})
	}

	t.Render()
}
