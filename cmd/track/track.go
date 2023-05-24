package track

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jedib0t/go-pretty/table"
	"github.com/spf13/cobra"

	"github.com/go-resty/resty/v2"
)

// Define the base URL for the Toggl Track API v9
const baseURL = "https://api.track.toggl.com/api/v9"

// Create a Resty Client
var apiClient *resty.Client

// Define the command for downloading time entries
var DownloadCmd = &cobra.Command{
	Use:   "download",
	Short: "Download time entries for a client and time range",
	Run:   execute,
}

// Define the API token flag
var apiToken string
var clientName string
var startDate string
var endDate string
var workspaceId int

func init() {
	// Add the API token flag to the command
	DownloadCmd.Flags().StringVarP(&apiToken, "token", "t", "", "Toggl Track API token")
	DownloadCmd.MarkFlagRequired("token") // Mark the token flag as required

	// Add the client name flag to the command
	DownloadCmd.Flags().StringVarP(&clientName, "client", "c", "", "Client name")
	// DownloadCmd.MarkFlagRequired("client") // Mark the client flag as required

	// Add the wip name flag to the command
	DownloadCmd.Flags().IntVarP(&workspaceId, "wip", "w", 0, "Client name")
	DownloadCmd.MarkFlagRequired("wip") // Mark the wip flag as required

	// Add the start date flag to the command
	DownloadCmd.Flags().StringVarP(&startDate, "start", "s", "", "Start date (YYYY-MM-DD)")
	// DownloadCmd.MarkFlagRequired("start") // Mark the start flag as required

	// Add the end date flag to the command
	DownloadCmd.Flags().StringVarP(&endDate, "end", "e", "", "End date (YYYY-MM-DD)")
	// DownloadCmd.MarkFlagRequired("end") // Mark the end flag as required
}

// downloadTimeEntries is the function that executes when the download command is called
func execute(cmd *cobra.Command, args []string) {
	apiClient = resty.New().
		SetBaseURL(baseURL).
		SetDebug(false).
		SetBasicAuth(apiToken, "api_token")

	entries, err := getTimeEntries()
	if err != nil {
		log.Fatalf("Failed to download time entries: %v", err)
	}

	entries = filterEntriesForWorkspace(entries, workspaceId)

	projects := []Project{}
	clients := []Client{}

	enrichedEntries := []EnrichedTimeEntry{}
	for _, entry := range entries {
		// fmt.Printf("Processing entry: %+v\n", entry)
		project := containsProject(projects, entry.ProjectId)
		if project == nil {
			project, err = getProjectById(entry.WorkspaceId, entry.ProjectId)
			// fmt.Printf("Downloaded Project: %+v\n", project)

			if err != nil {
				log.Fatalf("Failed to get project: %v", err)
			}
			projects = append(projects, *project)
		} else {
			// fmt.Printf("Project already downloaded\n")
		}

		client := containsClient(clients, project.ClientId)
		if client == nil {
			// fmt.Printf("Downloading client: %d\n", *project.ClientId)
			client, err = getClientById(entry.WorkspaceId, project.ClientId)
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
		totalDuration += time.Duration(entry.Duration) * time.Second
	}

	// print entries using go-pretty as a table
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project", "Description", "Duration", "Tags"})
	for _, eentry := range enrichedEntries {
		entry := eentry.TimeEntry
		project := eentry.Project
		client := eentry.Client
		t.AppendRow(table.Row{fmt.Sprintf("%s / %s", client.Name, project.Name), *entry.Description, time.Duration(entry.Duration) * time.Second, entry.Tags})
	}
	t.AppendFooter(table.Row{"TOTAL", "", totalDuration, ""})
	t.Render()

	// print aggreagted results
	aggregated := map[string]time.Duration{}
	for _, eentry := range enrichedEntries {
		entry := eentry.TimeEntry
		project := eentry.Project
		client := eentry.Client
		key := fmt.Sprintf("%s / %s", client.Name, project.Name)
		aggregated[key] += time.Duration(entry.Duration) * time.Second
	}

	t = table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project", "Duration"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, duration})
	}
	t.Render()

	// group by description
	aggregated = map[string]time.Duration{}
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

	t = table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Description", "Duration"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, duration})
	}
	t.AppendFooter(table.Row{"Total", totalDuration})
	t.Render()
}

func containsProject(projects []Project, projectId *int) *Project {
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

func containsClient(clients []Client, clientId *int) *Client {
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

func getTimeEntries() ([]TimeEntry, error) {
	// // Parse the start and end dates
	// start, err := time.Parse("2006-01-02", startDate)
	// if err != nil {
	// 	log.Fatal("Invalid start date format. Please use the format YYYY-MM-DD.")
	// }

	// end, err := time.Parse("2006-01-02", endDate)
	// if err != nil {
	// 	log.Fatal("Invalid end date format. Please use the format YYYY-MM-DD.")
	// }

	now := time.Now()
	year, month, _ := now.Date()
	firstDayOfThisMonth := time.Date(year, month, 1, 0, 0, 0, 0, now.Location())
	endOfThisMonth := time.Date(year, month+1, 0, 0, 0, 0, 0, now.Location())

	// Parse the start and end dates
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		start = firstDayOfThisMonth
	}

	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		end = endOfThisMonth
	}

	entries := &[]TimeEntry{}
	_, err = apiClient.R().
		SetHeader("Accept", "application/json").
		SetQueryParams(map[string]string{ // sample of those who use this manner
			"start_date": start.Format("2006-01-02T15:04:05Z07:00"),
			"end_date":   end.Format("2006-01-02T15:04:05Z07:00"),
		}).
		SetResult(entries).
		Get("/me/time_entries")

	fmt.Printf("Show on website: https://www.toggl.com/app/reports/summary/%d/from/%s/to/%s\n", workspaceId, start.Format("2006-01-02"), end.Format("2006-01-02"))

	return *entries, err
}

func getProjectById(workspaceId int, projectId *int) (*Project, error) {
	project := &Project{}
	_, err := apiClient.R().
		SetResult(project).
		Get(fmt.Sprintf("/workspaces/%d/projects/%d", workspaceId, *projectId))
	return project, err
}

func getClientById(workspaceId int, clientId *int) (*Client, error) {
	resp := &Client{}
	_, err := apiClient.R().
		SetResult(resp).
		Get(fmt.Sprintf("/workspaces/%d/clients/%d", workspaceId, *clientId))
	return resp, err
}

func filterEntriesForWorkspace(entries []TimeEntry, workspaceId int) []TimeEntry {
	filtered := []TimeEntry{}
	for _, entry := range entries {
		if entry.WorkspaceId == workspaceId {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

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
	Start string `json:"start"`

	// Stop time in UTC, can be null if it's still running or created with "duration" and "duronly" fields
	Stop *string `json:"stop"`

	// Tag names, null if tags were not provided or were later deleted
	Tags []string `json:"tags"`
}

type EnrichedTimeEntry struct {
	TimeEntry
	Project Project
	Client  Client
}
