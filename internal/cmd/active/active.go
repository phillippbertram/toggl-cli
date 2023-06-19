package active

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
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

			if opts.apiToken == "" {
				token := os.Getenv("TOGGL_API_TOKEN")
				if token == "" {
					return fmt.Errorf("no API token provided")
				}
				opts.apiToken = token
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return activeRun(&opts)
		},
	}

	// TODO: make this a persistent flag
	cmd.Flags().StringVar(&opts.apiToken, "token", "", "Toggl Track API token")

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
