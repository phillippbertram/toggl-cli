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
	title       string
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
	cmd.Flags().StringVarP(&opts.title, "title", "t", "", "Title of the time entry")

	return cmd
}

func startTrackingRun(opts *StartTrackingOpts) error {

	// TODO: get workspace ID and project ID
	var workspaceID *int
	var projectID *int

	if workspaceID == nil {
		user, err := opts.api.GetMe()
		if err != nil {
			return err
		}
		workspaceID = &user.DefaultWorkspaceID
	}

	now := time.Now()
	startTime := now.Format("2006-01-02T15:04:05-07:00")

	entry, err := opts.api.StartTimeEntry(&api.CreateTypeEntryRequestDto{
		ProjectID:   projectID,
		WorkspaceID: *workspaceID,
		Start:       startTime,
		Description: opts.title,
		Duration:    -1, // -1 means the entry is still running
	})

	fmt.Printf("Started time entry %+v\n", entry)
	return err
}
