package service

import (
	"os"
	"strings"
	"time"

	"github.com/gookit/color"
	"github.com/jedib0t/go-pretty/table"
)

func PrettyPrintTimeEntries(enrichedEntries []TimeEntry) {

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Description", "Project", "Start", "End", "Duration"})

	for _, rEntry := range enrichedEntries {
		entry := rEntry.TimeEntry
		projectColor := rEntry.Project.Color

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
			endDate = "running"
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

		cliColor := color.HEX(projectColor)

		t.AppendRow(table.Row{
			// entry.ID,
			cliColor.Sprintf(description),
			cliColor.Sprintf(projectName),
			cliColor.Sprintf(startDate),
			cliColor.Sprintf(endDate),
			cliColor.Sprintf(duration),
		})
	}

	t.Render()
}

func GetStatistics(entries []TimeEntry) *TimeStatistics {
	totalDuration := time.Duration(0)
	for _, entry := range entries {
		totalDuration += time.Duration(entry.TimeEntry.Duration) * time.Second
	}

	earliestEntry := GetEarliestEntry(entries)
	latestEntry := GetLatestEntry(entries)

	// group by description
	aggregated := map[string]time.Duration{}
	for _, eentry := range entries {
		entry := eentry.TimeEntry
		project := eentry.Project
		client := eentry.Client
		group := strings.Split(*entry.Description, ":")[0]

		if group == "" {
			group = "<NO_DESCRIPTION>"
		}

		keys := []string{}
		if client != nil {
			keys = append(keys, client.Name)
		} else {
			keys = append(keys, "NO_CLIENT")
		}
		if project != nil {
			keys = append(keys, project.Name)
		} else {
			keys = append(keys, "NO_PROJECT")
		}
		keys = append(keys, group)

		key := strings.Join(keys, "/")
		aggregated[key] += time.Duration(entry.Duration) * time.Second
	}

	return &TimeStatistics{
		TotalDuration: totalDuration,
		EarliestEntry: earliestEntry,
		LatestEntry:   latestEntry,
	}
}
