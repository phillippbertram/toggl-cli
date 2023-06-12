package times

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jedib0t/go-pretty/table"
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
)

// convert duration into decimal hours
func durationToHours(duration time.Duration) float64 {
	return float64(duration) / float64(time.Hour)
}

func formatDuration(duration time.Duration) string {
	return fmt.Sprintf("%.2f", durationToHours(duration))
}

type EnrichedTimeEntry struct {
	TimeEntry api.TimeEntryDto
	Project   *api.ProjectDto
	Client    *api.ClientDto
}

// Define the API token flag
type TimesOpts struct {
	api *api.Api

	apiToken string
	// clientName  string
	// workspaceId int
	startDate string
	endDate   string
}

func NewCmdTimes() *cobra.Command {

	opts := TimesOpts{}

	cmd := &cobra.Command{
		Use:   "times",
		Short: "Download time entries for a client and time range",
		RunE: func(cmd *cobra.Command, args []string) error {

			if opts.apiToken == "" {
				token := os.Getenv("TOGGL_API_TOKEN")
				if token == "" {
					return fmt.Errorf("No API token provided")
				}
				opts.apiToken = token
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return timesRun(&opts)
		},
	}

	// Add the API token flag to the command
	cmd.Flags().StringVarP(&opts.apiToken, "token", "t", "", "Toggl Track API token")
	// cmd.MarkFlagRequired("token")

	// Add the client name flag to the command
	// cmd.Flags().StringVarP(&opts.clientName, "client", "c", "", "Client name")
	// cmd.MarkFlagRequired("client") // Mark the client flag as required

	// Add the wip name flag to the command
	// cmd.Flags().IntVarP(&opts.workspaceId, "wip", "w", 0, "Client name")
	// cmd.MarkFlagRequired("wip") // Mark the wip flag as required

	// Add the start date flag to the command
	cmd.Flags().StringVarP(&opts.startDate, "start", "s", "", "Start date (YYYY-MM-DD)")

	// Add the end date flag to the command
	cmd.Flags().StringVarP(&opts.endDate, "end", "e", "", "End date (YYYY-MM-DD)")

	return cmd
}

// downloadTimeEntries is the function that executes when the download command is called
func timesRun(opts *TimesOpts) error {

	entries, err := opts.api.GetTimeEntries(&api.GetTimeEntriesOpts{
		// WorkspaceId: opts.workspaceId,
		StartDate: &opts.startDate,
		EndDate:   &opts.endDate,
	})
	if err != nil {
		log.Fatalf("Failed to download time entries: %v", err)
	}

	enrichedEntries, err := getEnrichedTimeEntries(entries, opts)
	if err != nil {
		log.Fatalf("failed to enrich time entries: %v", err)
	}

	totalDuration := time.Duration(0)
	for _, entry := range enrichedEntries {
		totalDuration += time.Duration(entry.TimeEntry.Duration) * time.Second
	}

	earliestEntry := getEarliestEntry(enrichedEntries)
	latestEntry := getLatestEntry(enrichedEntries)

	fmt.Printf("Time Range: %s - %s\n", earliestEntry.TimeEntry.Start.Format("2006-01-02"), latestEntry.TimeEntry.Start.Format("2006-01-02"))

	// group by description
	aggregated := map[string]time.Duration{}
	for _, eentry := range enrichedEntries {
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

	totalDuration = time.Duration(0)
	for _, duration := range aggregated {
		totalDuration += duration
	}

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Description", "Duration (hours)"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, formatDuration(duration)})
	}
	t.AppendFooter(table.Row{"Total", formatDuration(totalDuration)})

	// TODO add sorting, this is not working properly
	t.SortBy([]table.SortBy{
		{Name: "Duration (hours)", Mode: table.Asc},
	})
	t.Render()

	return nil
}

func getEnrichedTimeEntries(entries []api.TimeEntryDto, opts *TimesOpts) ([]EnrichedTimeEntry, error) {
	projects := []api.ProjectDto{}
	clients := []api.ClientDto{}

	enrichedEntries := []EnrichedTimeEntry{}
	for _, entry := range entries {

		// read from cache
		project := api.GetProjectById(projects, entry.ProjectId)
		if project == nil && entry.ProjectId != nil {
			// fetch from API
			newProject, err := opts.api.GetProjectById(entry.WorkspaceId, *entry.ProjectId)
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
				freshClient, err := opts.api.GetClientById(entry.WorkspaceId, *project.ClientId)
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

		enrichedEntries = append(enrichedEntries, EnrichedTimeEntry{
			TimeEntry: entry,
			Project:   project,
			Client:    client,
		})
	}

	enrichedEntries = ignoreRunningEntries(enrichedEntries)
	return enrichedEntries, nil
}

func getEarliestEntry(entries []EnrichedTimeEntry) EnrichedTimeEntry {
	earliestEntry := entries[0]
	for _, entry := range entries {
		if entry.TimeEntry.Start.Compare(earliestEntry.TimeEntry.Start) == -1 {
			earliestEntry = entry
		}
	}
	return earliestEntry
}

func getLatestEntry(entries []EnrichedTimeEntry) EnrichedTimeEntry {
	latestEntry := entries[0]
	for _, entry := range entries {
		if entry.TimeEntry.Start.Compare(latestEntry.TimeEntry.Start) == 1 {
			latestEntry = entry
		}
	}
	return latestEntry
}

func ignoreRunningEntries(entries []EnrichedTimeEntry) []EnrichedTimeEntry {
	filtered := []EnrichedTimeEntry{}
	for _, entry := range entries {
		if entry.TimeEntry.Duration >= 0 {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}
