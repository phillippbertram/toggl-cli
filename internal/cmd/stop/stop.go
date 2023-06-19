package stop

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

func NewCmdStop() *cobra.Command {

	opts := StartTrackingOpts{}

	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop tracking time for a project",
		RunE: func(cmd *cobra.Command, args []string) error {

			if opts.apiToken == "" {
				token := os.Getenv("TOGGL_API_TOKEN")
				if token == "" {
					return fmt.Errorf("no API token provided")
				}
				opts.apiToken = token
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return stopTrackingRun(&opts)
		},
	}

	// TODO: make this a persistent flag
	// Add the API token flag to the command
	cmd.Flags().StringVarP(&opts.apiToken, "token", "t", "", "Toggl Track API token")

	return cmd
}

func stopTrackingRun(opts *StartTrackingOpts) error {
	runningEntry, error := opts.api.GetRunningTimeEntry()
	if error != nil || runningEntry == nil {
		fmt.Printf("No running time entry found\n")
		return error
	}
	fmt.Printf("Stopping time entry %+v\n", runningEntry)

	_, error = opts.api.StopTimeEntry(runningEntry)
	return error
}
