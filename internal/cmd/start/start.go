package start

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
)

// Define the API token flag
type StartTrackingOpts struct {
	api *api.Api

	apiToken    string
	projectName string
	description string
	force       bool
}

func NewCmdStart() *cobra.Command {

	opts := StartTrackingOpts{}

	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start tracking time for a project",
		RunE: func(cmd *cobra.Command, args []string) error {

			if opts.apiToken == "" {
				token := os.Getenv("TOGGL_API_TOKEN")
				if token == "" {
					return fmt.Errorf("no API token provided")
				}
				opts.apiToken = token
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return startTrackingRun(&opts)
		},
	}

	// TODO: make this a persistent flag
	cmd.Flags().StringVar(&opts.apiToken, "token", "", "Toggl Track API token")
	cmd.Flags().StringVarP(&opts.projectName, "project", "p", "", "Project Name to start tracking time for")
	cmd.Flags().StringVarP(&opts.description, "description", "d", "", "Description of the time entry")
	cmd.Flags().BoolVarP(&opts.force, "force", "f", false, "Force the start of a new time entry")

	return cmd
}

func startTrackingRun(opts *StartTrackingOpts) error {

	// TODO: get workspace ID from opts
	var workspaceID *int
	if workspaceID == nil {
		user, err := opts.api.GetMe()
		if err != nil {
			return err
		}
		workspaceID = &user.DefaultWorkspaceID
	}

	var projectID *int
	if opts.projectName != "" {
		project, err := opts.api.GetProjectByName(*workspaceID, opts.projectName)
		if err != nil {
			return err
		}
		projectID = &project.ID
	}

	activeEntry, _ := opts.api.GetActiveTimeEntry()
	if activeEntry != nil && !opts.force {
		return fmt.Errorf("there is already an active time entry. Use --force to override")
	}

	now := time.Now()
	startTime := now.Format("2006-01-02T15:04:05-07:00")

	entry, err := opts.api.StartTimeEntry(&api.CreateTypeEntryRequestDto{
		ProjectID:   projectID,
		WorkspaceID: *workspaceID,
		Start:       startTime,
		Description: opts.description,
		Duration:    -1, // -1 means the entry is still running
	})

	fmt.Printf("Started time entry %+v\n", entry)
	return err
}
