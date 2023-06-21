package ls

import (
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/service"
	"phillipp.io/toggl-cli/internal/utils"
)

type LsOpts struct {
	timeService *service.TimeService
}

func NewCmdLs() *cobra.Command {

	opts := LsOpts{}

	cmd := &cobra.Command{
		Use:   "ls",
		Short: "List all time entries for a time range",
		RunE: func(cmd *cobra.Command, args []string) error {

			var apiToken string
			err := utils.GetApiToken(cmd, &apiToken)
			if err != nil {
				return err
			}

			api := api.NewApi(api.ApiOpts{ApiToken: apiToken})
			opts.timeService = service.NewTimeService(api)

			return lsRun(&opts)
		},
	}

	return cmd
}

func lsRun(opts *LsOpts) error {
	entries, err := opts.timeService.GetTimeEntries(&service.GetTimeEntriesOpts{})
	if err != nil {
		return err
	}

	service.PrettyPrintTimeEntries(entries)

	return nil
}
