package start

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
)

// Define the API token flag
type StartTrackingOpts struct {
	api *api.Api

	apiToken string
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
	// Add the API token flag to the command
	cmd.Flags().StringVarP(&opts.apiToken, "token", "t", "", "Toggl Track API token")

	return cmd
}

// downloadTimeEntries is the function that executes when the download command is called
func startTrackingRun(opts *StartTrackingOpts) error {
	return nil
}
