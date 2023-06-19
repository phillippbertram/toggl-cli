package stop

import (
	"fmt"

	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/utils"
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

			err := utils.GetApiToken(cmd, &opts.apiToken)
			if err != nil {
				return err
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return stopTrackingRun(&opts)
		},
	}

	return cmd
}

func stopTrackingRun(opts *StartTrackingOpts) error {
	runningEntry, error := opts.api.GetActiveTimeEntry()
	if error != nil || runningEntry == nil {
		fmt.Printf("No running time entry found\n")
		return error
	}
	fmt.Printf("Stopping time entry %+v\n", runningEntry)

	_, error = opts.api.StopTimeEntry(runningEntry)
	return error
}
