package active

import (
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/utils"
)

// Define the API token flag
type ActiveOpts struct {
	api *api.Api

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

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return activeRun(&opts)
		},
	}

	return cmd
}

func activeRun(opts *ActiveOpts) error {

	activeEntry, err := opts.api.GetActiveTimeEntry()
	if err != nil {
		return err
	}

	api.PrettyPrintTimeEntry(activeEntry)
	return err
}
