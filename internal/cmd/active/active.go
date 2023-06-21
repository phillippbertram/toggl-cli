package active

import (
	"fmt"

	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/service"
	"phillipp.io/toggl-cli/internal/utils"
)

// Define the API token flag
type ActiveOpts struct {
	timeService *service.TimeService

	apiToken string
}

func NewCmdActive() *cobra.Command {

	opts := ActiveOpts{}

	cmd := &cobra.Command{
		Use:   "active",
		Short: "Show the active time entry if there is one",
		RunE: func(cmd *cobra.Command, args []string) error {

			err := utils.GetApiToken(cmd, &opts.apiToken)
			if err != nil {
				return err
			}

			api := api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})
			opts.timeService = service.NewTimeService(api)

			return activeRun(&opts)
		},
	}

	return cmd
}

func activeRun(opts *ActiveOpts) error {

	activeEntry, err := opts.timeService.GetActiveTimeEntry()
	if err != nil {
		return err
	}

	if activeEntry == nil {
		fmt.Println("There is no active time entry")
		return nil
	}

	fmt.Println("Active time entry:")
	service.PrettyPrintTimeEntry(activeEntry)

	return err
}
