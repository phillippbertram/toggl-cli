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

type EnrichedTimeEntry struct {
	TimeEntry api.TimeEntry
	Project   api.Project
	Client    api.Client
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

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return timesRun(&opts)
		},
	}

	// Add the API token flag to the command
	cmd.Flags().StringVarP(&opts.apiToken, "token", "t", "", "Toggl Track API token")
	cmd.MarkFlagRequired("token") // Mark the token flag as required

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

	// entries = api.FilterEntriesForWorkspace(entries, opts.workspaceId)

	projects := []api.Project{}
	clients := []api.Client{}

	enrichedEntries := []EnrichedTimeEntry{}
	for _, entry := range entries {

		// get project
		project := api.ContainsProject(projects, entry.ProjectId)
		if project == nil {
			project, err = opts.api.GetProjectById(entry.WorkspaceId, entry.ProjectId)

			if err != nil {
				log.Fatalf("Failed to get project: %v", err)
			}
			projects = append(projects, *project)
		}

		// get client
		client := api.ContainsClient(clients, project.ClientId)
		if client == nil {
			// fmt.Printf("Downloading client: %d\n", *project.ClientId)
			client, err = opts.api.GetClientById(entry.WorkspaceId, project.ClientId)
			if err != nil {
				// log.Fatalf("Failed to get client: %v\n", err)
			}
			clients = append(clients, *client)
		}

		enrichedEntries = append(enrichedEntries, EnrichedTimeEntry{
			TimeEntry: entry,
			Project:   *project,
			Client:    *client,
		})
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
		key := fmt.Sprintf("%s / %s / %s", client.Name, project.Name, group)
		aggregated[key] += time.Duration(entry.Duration) * time.Second
	}

	totalDuration = time.Duration(0)
	for _, duration := range aggregated {
		totalDuration += duration
	}

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Description", "Duration"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, duration})
	}
	t.AppendFooter(table.Row{"Total", totalDuration})

	// TODO add sorting, this is not working properly
	t.SortBy([]table.SortBy{
		{Name: "Duration", Mode: table.Asc},
	})
	t.Render()

	return nil
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
