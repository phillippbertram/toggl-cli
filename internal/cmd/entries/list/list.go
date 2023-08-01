package list

import (
	"github.com/MakeNowJust/heredoc"
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/service"
	"phillipp.io/toggl-cli/internal/utils"
)

type ListOpts struct {
	timeService *service.TimeService

	Client string
}

func NewCmdList() *cobra.Command {

	opts := ListOpts{}

	cmd := &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls"},
		Short:   "List all time entries for a time range",
		Example: heredoc.Doc(`
			$ toggl entries list
			$ toggl entries ls
		`),
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

	cmd.Flags().StringVarP(&opts.Client, "client", "c", "", "Client name")

	return cmd
}

func lsRun(opts *ListOpts) error {
	entries, err := opts.timeService.GetTimeEntries(&service.GetTimeEntriesOpts{
		ClientName: &opts.Client,
	})
	if err != nil {
		return err
	}

	service.PrettyPrintTimeEntries(entries)

	return nil
}
