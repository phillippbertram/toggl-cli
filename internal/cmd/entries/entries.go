package entries

import (
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/cmd/entries/list"
)

func NewCmdEntries() *cobra.Command {

	cmd := &cobra.Command{
		Use:   "entries <subcommand> [flags]",
		Short: "List all time entries for a time range",
	}

	cmd.AddCommand(list.NewCmdList())

	return cmd
}
